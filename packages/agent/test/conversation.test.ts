import { describe, expect, it } from 'vitest';
import { decryptField, ENCRYPTED_COLUMNS, normalizeANumber } from '@chhetry/db';
import { disclosures, factsNotAdviceLabel, t } from '@chhetry/i18n';
import { RULES_VERSION } from '@chhetry/rules';
import { FakeLlmAdapter } from '../src/index.js';
import { answerModule, CLEAR_TRIAGE, setup, startClear } from './helpers.js';

const d = (value: string) => ({ kind: 'date', value });

const CORE = {
  full_name: 'Maya Gurung', phone: '+12125550199', email: 'maya@example.com', sms_consent: true, case_for: 'self',
  state: 'NY', city: 'Queens', goal_free_text: 'I want to sponsor my husband', country_of_birth: 'NP', citizenships: ['NP'], in_us: true,
};
const HISTORY = {
  last_entry_manner: 'visa', last_entry_date: d('2019-08-01'), current_status: 'H-1B', prior_court_or_removal: 'none',
  a_number: 'A-200-000-555', overstay_length: 'none',
};
const FAMILY = { relationship_to_usc_or_lpr: 'spouse', sponsor_status: 'usc', marriage_date: d('2024-05-10'), children_ages: [19] };

describe('conversation start (guardrail 6)', () => {
  it('opens with the disclosures in the caller language', async () => {
    const { svc, audit } = setup();
    const { token, turn } = await svc.start({ channel: 'app', lang: 'ne' });
    expect(turn.state).toBe('disclosures');
    expect(turn.messages).toEqual(disclosures('ne').map((x) => x.text));
    expect(svc.verifyToken(turn.conversationId, token)).toBe(true);
    expect(svc.verifyToken(turn.conversationId, 'wrong')).toBe(false);
    expect(audit.entries().map((e) => e.action)).toContain('conversation.start');
  });

  it('ends if the caller does not accept the AI disclosure', async () => {
    const { svc } = setup();
    const { turn } = await svc.start({ channel: 'web', lang: 'en' });
    const r = await svc.acceptDisclosures(turn.conversationId, { aiDisclosureAck: false, recordingConsent: true, infoNotAdviceAck: true });
    expect(r.state).toBe('end');
    expect(r.messages).toEqual([t('en', 'agent.disclosures_declined')]);
  });

  it('continues without recording when recording is declined', async () => {
    const { svc } = setup();
    const { turn } = await svc.start({ channel: 'web', lang: 'en' });
    const r = await svc.acceptDisclosures(turn.conversationId, { aiDisclosureAck: true, recordingConsent: false, infoNotAdviceAck: true });
    expect(r.state).toBe('triage');
    expect(r.question?.id).toBe('detained');
    expect(svc.get(turn.conversationId).recordingConsent).toBe(false);
  });

  it('refuses intake actions before disclosures', async () => {
    const { svc } = setup();
    const { turn } = await svc.start({ channel: 'web', lang: 'en' });
    await expect(svc.answer(turn.conversationId, { module: 'triage', field: 'detained', value: false })).rejects.toThrow(/Not collecting/);
  });
});

describe('urgent triage (guardrail 5)', () => {
  it('escalates and stops intake when the person is detained', async () => {
    const { svc, escalations } = setup();
    const { turn } = await svc.start({ channel: 'phone', lang: 'bn' });
    await svc.acceptDisclosures(turn.conversationId, { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true });
    const r = await answerModule(svc, await svc.answer(turn.conversationId, { module: 'triage', field: 'detained', value: true }), CLEAR_TRIAGE);
    expect(r.state).toBe('on_call_alert');
    expect(r.escalation?.flags).toEqual(['detained']);
    expect(r.question).toBeNull();
    expect(r.messages).toContain(t('bn', 'agent.urgent_escalation'));
    expect(await escalations.list()).toHaveLength(1);
  });

  it('escalates on a hearing within 7 days', async () => {
    const { svc } = setup();
    const { turn } = await svc.start({ channel: 'app', lang: 'en' });
    let r = await svc.acceptDisclosures(turn.conversationId, { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true });
    r = await answerModule(svc, r, { ...CLEAR_TRIAGE, hearing_date: d('2026-12-01') });
    expect(r.state).toBe('on_call_alert');
    expect(r.escalation?.flags).toEqual(['hearing_within_7_days']);
  });

  it('escalates when urgent words appear in free text at any point', async () => {
    const { svc } = setup();
    const { turn } = await startClear(svc);
    expect(turn.state).toBe('goal');
    const r = await svc.say(turn.conversationId, 'ICE came to my house this morning');
    expect(r.state).toBe('on_call_alert');
    expect(r.escalation?.flags).toContain('ice_contact');
  });

  it('escalates when urgent words appear in a typed answer, in Nepali', async () => {
    const { svc } = setup();
    let { turn } = await startClear(svc, 'ne');
    turn = await svc.setGoal(turn.conversationId, 'family');
    turn = await answerModule(svc, turn, { full_name: 'X', phone: '+12125550111', sms_consent: false, case_for: 'self', state: 'NY' }, 'goal_free_text');
    expect(turn.question?.id).toBe('goal_free_text');
    const r = await svc.answer(turn.conversationId, { module: 'core', field: 'goal_free_text', value: 'मेरो श्रीमान्लाई हिरासतमा राखेको छ' });
    expect(r.state).toBe('on_call_alert');
  });
});

describe('new client intake', () => {
  async function runIntake(llm?: FakeLlmAdapter) {
    const env = setup(llm ? { llm } : {});
    let { turn } = await startClear(env.svc);
    turn = await env.svc.setGoal(turn.conversationId, 'family');
    expect(turn.state).toBe('core');
    turn = await answerModule(env.svc, turn, CORE);
    expect(turn.state).toBe('history');
    const q = await env.svc.say(turn.conversationId, 'Can I travel to Nepal in December?');
    expect(q.messages[0]).toBe(t('en', 'agent.question_for_consult'));
    expect(q.question?.id).toBe(turn.question?.id);
    turn = await answerModule(env.svc, q, HISTORY);
    expect(turn.state).toBe('module');
    turn = await answerModule(env.svc, turn, FAMILY);
    return { ...env, turn };
  }

  it('walks goal, core, history and the family module, then plays back', async () => {
    const { turn } = await runIntake();
    expect(turn.state).toBe('playback');
    expect(turn.playback).toContain('What is your full name? Maya Gurung');
    expect(turn.playback?.some((l) => l.includes('••••555'))).toBe(false);
    expect(turn.playback?.join('\n')).not.toContain('200000555');
  });

  it('lets the caller correct an answer during playback', async () => {
    const { svc, turn } = await runIntake();
    const r = await svc.correct(turn.conversationId, { module: 'core', field: 'city', value: 'Brooklyn' });
    expect(r.state).toBe('playback');
    expect(r.playback).toContain('Which city? Brooklyn');
  });

  it('on confirm: runs rules, writes the CRM, and queues the assessment and the noted question for the attorney', async () => {
    const { svc, turn, reviewQueue, crm, audit, logs, keyRing } = await runIntake();
    const r = await svc.confirm(turn.conversationId);
    expect(r.state).toBe('end');
    expect(r.messages[0]).toContain(t('en', 'agent.intake_saved'));

    const items = await reviewQueue.list();
    const assessment = items.find((i) => i.kind === 'assessment')!;
    expect(assessment.status).toBe('open');
    expect(assessment.aiDraft).toContain(RULES_VERSION);
    expect(assessment.aiDraft).toContain('cspa.age_out_risk');
    expect(assessment.aiDraft).not.toContain('200000555');
    const noted = items.find((i) => i.reason === 'asked_during_intake')!;
    expect(noted.question).toBe('Can I travel to Nepal in December?');

    const conv = svc.get(turn.conversationId);
    const person = await crm.findPerson({ email: 'maya@example.com' });
    expect(person?.id).toBe(conv.personId);
    expect(decryptField(person!.aNumber!, ENCRYPTED_COLUMNS.personANumber, keyRing)).toBe(normalizeANumber('A200000555'));

    const actions = audit.entries().map((e) => e.action);
    for (const a of ['intake.field.write', 'intake.confirm', 'assessment.create', 'crm.write', 'review.create', 'person.write']) expect(actions).toContain(a);

    // Guardrail 8: no names or A-numbers in logs or audit.
    const dump = logs.join('\n') + JSON.stringify(audit.entries());
    expect(dump).not.toMatch(/Maya|Gurung|200000555|200-000-555|maya@example/);
  });

  it('refuses to confirm with required answers missing', async () => {
    const { svc } = setup();
    let { turn } = await startClear(svc);
    turn = await svc.setGoal(turn.conversationId, 'other');
    // Skipping a required question is refused.
    await expect(svc.skip(turn.conversationId, { module: 'core', field: 'full_name' })).rejects.toThrow(/required/);
  });

  it('rejects invalid answers', async () => {
    const { svc } = setup();
    const { turn } = await svc.start({ channel: 'app', lang: 'en' });
    await svc.acceptDisclosures(turn.conversationId, { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true });
    await expect(svc.answer(turn.conversationId, { module: 'triage', field: 'detained', value: 'maybe' })).rejects.toThrow(/Invalid answer/);
  });
});

describe('ask from file (existing client)', () => {
  const SITA = 'per_sita_sharma';
  const RAM = 'per_ram_sharma';

  it('answers a fact question from the file with the label (guardrail 7), sending no ids to the LLM', async () => {
    const llm = new FakeLlmAdapter(() => 'Your master calendar hearing is on 2027-02-18.');
    const { svc } = setup({ llm });
    const { turn } = await startClear(svc, 'en', SITA);
    expect(turn.state).toBe('existing_client');
    const r = await svc.say(turn.conversationId, 'When is my next hearing?');
    expect(r.state).toBe('existing_client');
    expect(r.messages[0]).toContain('2027-02-18');
    expect(r.messages[0]!.endsWith(factsNotAdviceLabel('en'))).toBe(true);
    const sent = JSON.stringify(llm.requests);
    expect(sent).not.toContain('IOE0900000101');
    expect(sent).not.toContain('A200000101');
    expect(llm.requests[0]!.system).toContain('Answer only from FACTS');
  });

  it('answers without an LLM from a template, in the caller language', async () => {
    const { svc } = setup();
    const { turn } = await startClear(svc, 'ne', SITA);
    const r = await svc.say(turn.conversationId, 'कुन कागजात बाँकी छ?');
    expect(r.messages[0]).toContain('Joint bank statements');
    expect(r.messages[0]).toContain(factsNotAdviceLabel('ne'));
  });

  it('routes a legal question to the review queue with an attorney-only draft (guardrail 1)', async () => {
    const llm = new FakeLlmAdapter((req) => (req.purpose === 'draft_for_attorney' ? 'DRAFT: travel risk while I-485 pending' : 'x'));
    const { svc, reviewQueue } = setup({ llm });
    const { turn } = await startClear(svc, 'en', RAM);
    const r = await svc.say(turn.conversationId, 'Can I travel to Nepal before my interview?');
    expect(r.state).toBe('existing_client');
    expect(r.messages[0]).toContain(t('en', 'agent.legal_question_routed'));
    expect(r.messages.join(' ')).not.toContain('DRAFT');
    const item = await reviewQueue.get(r.reviewItemId!);
    expect(item).toMatchObject({ kind: 'legal_question', personId: RAM, status: 'open', reason: 'travel' });
    expect(item?.aiDraft).toContain('DRAFT');

    expect(await reviewQueue.clientAnswers(RAM)).toEqual([]);
    await reviewQueue.decide(item!.id, 'atty_chhetry', { decision: 'edit_send', finalText: 'Please do not travel until we talk. I will call you this week.' });
    expect((await reviewQueue.clientAnswers(RAM))[0]?.answer).toBe('Please do not travel until we talk. I will call you this week.');
  });

  it('blocks an LLM answer that promises an outcome, logs it, and queues a follow-up', async () => {
    const llm = new FakeLlmAdapter(() => 'Your interview is on 2027-01-08 and you will definitely be approved.');
    const { svc, reviewQueue, audit } = setup({ llm });
    const { turn } = await startClear(svc, 'en', RAM);
    const r = await svc.say(turn.conversationId, 'When is my interview?');
    expect(r.messages[0]).toContain(t('en', 'agent.answer_blocked'));
    expect(r.messages[0]).not.toContain('approved');
    expect((await reviewQueue.get(r.reviewItemId!))?.reason).toBe('answer_blocked');
    expect(audit.entries().some((e) => e.action === 'ai.output.blocked')).toBe(true);
  });

  it('blocks an answer with a date that is not in the file', async () => {
    const llm = new FakeLlmAdapter(() => 'Your interview is on 2027-01-09.');
    const { svc } = setup({ llm });
    const { turn } = await startClear(svc, 'en', RAM);
    const r = await svc.say(turn.conversationId, 'When is my interview?');
    expect(r.messages[0]).toContain(t('en', 'agent.answer_blocked'));
  });

  it('says it will ask the team when the answer is not in the file, and queues it', async () => {
    const llm = new FakeLlmAdapter(() => 'NOT_IN_FILE');
    const { svc, reviewQueue } = setup({ llm });
    const { turn } = await startClear(svc, 'bn', SITA);
    const r = await svc.say(turn.conversationId, 'আমার উকিলের নাম কী?');
    expect(r.messages[0]).toContain(t('bn', 'agent.not_in_file'));
    expect((await reviewQueue.get(r.reviewItemId!))?.reason).toBe('not_in_file');
  });

  it('falls back to the template when the LLM throws', async () => {
    const llm = new FakeLlmAdapter(() => { throw new Error('timeout'); });
    const { svc } = setup({ llm });
    const { turn } = await startClear(svc, 'en', RAM);
    const r = await svc.say(turn.conversationId, 'When is my interview?');
    expect(r.messages[0]).toContain('2027-01-08');
  });

  it('escalates an urgent message from an existing client', async () => {
    const { svc } = setup();
    const { turn } = await startClear(svc, 'en', SITA);
    const r = await svc.say(turn.conversationId, 'I missed my court hearing');
    expect(r.state).toBe('on_call_alert');
  });
});
