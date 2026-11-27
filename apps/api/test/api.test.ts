import { describe, expect, it } from 'vitest';
import { createLogger } from '@chhetry/shared';
import { factsNotAdviceLabel } from '@chhetry/i18n';
import { FakeLlmAdapter } from '@chhetry/agent';
import { buildDevApp, DevTokenAuthenticator } from '../src/index.js';

const TOKENS = {
  atty: { id: 'atty_chhetry', role: 'attorney' as const },
  sita: { id: 'usr_sita', role: 'client' as const, personId: 'per_sita_sharma' },
  ram: { id: 'usr_ram', role: 'client' as const, personId: 'per_ram_sharma' },
  staff: { id: 'stf_1', role: 'staff' as const },
};
const bearer = (t: keyof typeof TOKENS) => ({ authorization: `Bearer ${t}` });

async function setup(opts: { allowDraftLanguages?: boolean; llm?: FakeLlmAdapter } = {}) {
  const logs: string[] = [];
  const { app, deps } = await buildDevApp({ tokens: TOKENS, logger: createLogger({ sink: (l) => logs.push(l) }), today: () => '2026-11-27', ...opts });
  return { app, deps, logs };
}

async function startAsClient(app: Awaited<ReturnType<typeof setup>>['app'], who: 'sita' | 'ram') {
  const res = await app.inject({ method: 'POST', url: '/v1/conversations', headers: bearer(who), payload: { channel: 'app', lang: 'en' } });
  const { conversationId, token } = res.json();
  const h = { ...bearer(who), 'x-conversation-token': token };
  await app.inject({ method: 'POST', url: `/v1/conversations/${conversationId}/disclosures`, headers: h, payload: { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true } });
  for (const [field, value] of Object.entries({ detained: false, has_nta_or_removal_order: 'none', ice_contact: false, upcoming_deadline: false, stuck_abroad: false, in_danger: false })) {
    const r = await app.inject({ method: 'POST', url: `/v1/intake/${conversationId}/fields`, headers: h, payload: { module: 'triage', field, value } });
    if (r.json().question?.id === 'hearing_date') await app.inject({ method: 'POST', url: `/v1/intake/${conversationId}/skip`, headers: h, payload: { module: 'triage', field: 'hearing_date' } });
  }
  return { conversationId, h };
}

describe('auth and roles', () => {
  it('rejects review endpoints without a token, and for non-attorneys', async () => {
    const { app, deps } = await setup();
    expect((await app.inject({ method: 'GET', url: '/v1/review' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/review', headers: bearer('staff') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/review', headers: bearer('sita') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/review', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    expect(deps.audit.entries().filter((e) => e.action === 'tool.denied')).toHaveLength(2);
  });

  it('a client sees only their own cases', async () => {
    const { app } = await setup();
    const r = await app.inject({ method: 'GET', url: '/v1/me/cases', headers: bearer('ram') });
    expect(r.statusCode).toBe(200);
    expect(r.json().cases.map((c: { personId: string }) => c.personId)).toEqual(['per_ram_sharma', 'per_ram_sharma']);
  });

  it('conversation calls need the conversation token', async () => {
    const { app } = await setup();
    const { conversationId } = (await app.inject({ method: 'POST', url: '/v1/conversations', payload: { channel: 'web', lang: 'en' } })).json();
    const r = await app.inject({ method: 'POST', url: `/v1/conversations/${conversationId}/disclosures`, headers: { 'x-conversation-token': 'wrong' }, payload: { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true } });
    expect(r.statusCode).toBe(404);
  });

  it('DevTokenAuthenticator refuses to run in production', () => {
    expect(() => new DevTokenAuthenticator({}, 'production')).toThrow();
  });
});

describe('conversation API', () => {
  it('starts with disclosures, validates input, and maps state errors to 409', async () => {
    const { app } = await setup();
    const bad = await app.inject({ method: 'POST', url: '/v1/conversations', payload: { channel: 'fax', lang: 'en' } });
    expect(bad.statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/v1/conversations', payload: { channel: 'web', lang: 'bn' } });
    expect(res.statusCode).toBe(201);
    const { conversationId, token, turn } = res.json();
    expect(turn.state).toBe('disclosures');
    expect(turn.messages).toHaveLength(5);
    const early = await app.inject({ method: 'POST', url: `/v1/intake/${conversationId}/assess`, headers: { 'x-conversation-token': token } });
    expect(early.statusCode).toBe(409);
  });

  it('refuses draft-translation languages when not allowed (production setting)', async () => {
    const { app } = await setup({ allowDraftLanguages: false });
    expect((await app.inject({ method: 'POST', url: '/v1/conversations', payload: { channel: 'app', lang: 'ne' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/v1/conversations', payload: { channel: 'app', lang: 'en' } })).statusCode).toBe(201);
  });

  it('escalates an urgent message', async () => {
    const { app } = await setup();
    const { conversationId, token } = (await app.inject({ method: 'POST', url: '/v1/conversations', payload: { channel: 'web', lang: 'en' } })).json();
    const r = await app.inject({ method: 'POST', url: `/v1/conversations/${conversationId}/messages`, headers: { 'x-conversation-token': token }, payload: { text: 'my husband was detained by ICE' } });
    expect(r.json().state).toBe('on_call_alert');
    const list = await app.inject({ method: 'GET', url: '/v1/escalations', headers: bearer('staff') });
    expect(list.json().escalations).toHaveLength(1);
  });
});

describe('ask from file -> review -> approved answer (end to end)', () => {
  it('fact answers carry the label; legal questions reach the client only after attorney approval', async () => {
    const llm = new FakeLlmAdapter((req) => (req.purpose === 'draft_for_attorney' ? 'Draft: discuss travel risk with pending I-485.' : 'Your interview is on 2027-01-08.'));
    const { app, logs } = await setup({ llm });
    const { conversationId, h } = await startAsClient(app, 'ram');

    const fact = await app.inject({ method: 'POST', url: '/v1/questions', headers: h, payload: { conversationId, text: 'When is my interview?' } });
    expect(fact.json().messages[0]).toBe(`Your interview is on 2027-01-08.\n\n${factsNotAdviceLabel('en')}`);

    const legal = await app.inject({ method: 'POST', url: '/v1/questions', headers: h, payload: { conversationId, text: 'Can I travel to Nepal next month?' } });
    const reviewId = legal.json().reviewItemId;
    expect(reviewId).toBeTruthy();
    expect(JSON.stringify(legal.json())).not.toContain('Draft:');

    expect((await app.inject({ method: 'GET', url: '/v1/me/answers', headers: bearer('ram') })).json().answers).toEqual([]);

    const queue = (await app.inject({ method: 'GET', url: '/v1/review?status=open', headers: bearer('atty') })).json().items;
    expect(queue.map((i: { id: string }) => i.id)).toContain(reviewId);

    const bad = await app.inject({ method: 'POST', url: `/v1/review/${reviewId}/decision`, headers: bearer('atty'), payload: { decision: 'edit_send' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: `/v1/review/${reviewId}/decision`, headers: bearer('atty'), payload: { decision: 'edit_send', finalText: 'Please wait until after your interview. I will call you.' } });
    expect(ok.json().status).toBe('edited_sent');
    const again = await app.inject({ method: 'POST', url: `/v1/review/${reviewId}/decision`, headers: bearer('atty'), payload: { decision: 'approve' } });
    expect(again.statusCode).toBe(409);

    const answers = (await app.inject({ method: 'GET', url: '/v1/me/answers', headers: bearer('ram') })).json().answers;
    expect(answers[0].answer).toBe('Please wait until after your interview. I will call you.');
    // Sita cannot see Ram's answers.
    expect((await app.inject({ method: 'GET', url: '/v1/me/answers', headers: bearer('sita') })).json().answers).toEqual([]);

    // Guardrail 8: request logs carry routes and status, not question text or tokens.
    const dump = logs.join('\n');
    expect(dump).not.toMatch(/travel to Nepal|Bearer|x-conversation-token/);
    expect(dump).toContain('/v1/questions');
  });
});

describe('review console', () => {
  it('serves the page and script with a strict CSP', async () => {
    const { app } = await setup();
    const page = await app.inject({ method: 'GET', url: '/console' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.body).toContain('/console/app.js');
    const js = await app.inject({ method: 'GET', url: '/console/app.js' });
    expect(js.body).not.toContain('innerHTML');
  });
});
