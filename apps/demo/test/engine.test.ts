import { describe, expect, it } from 'vitest';
import { factsNotAdviceLabel } from '@chhetry/i18n';
import type { Lang } from '@chhetry/shared';
import { createDemoEngine } from '../src/engine.js';
import { SAMPLE_ANSWERS, SUGGESTED_QUESTIONS } from '../src/strings.js';

const TODAY = '2026-11-27';
const engine = () => createDemoEngine({ today: () => TODAY });

async function asClient(e: ReturnType<typeof engine>, lang: Lang, personId: string) {
  const { turn } = await e.start(lang, personId);
  const id = turn.conversationId;
  let t = await e.conversations.acceptDisclosures(id, { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true });
  while (t.question) {
    const q = t.question;
    t = q.required ? await e.conversations.answer(id, { module: q.module, field: q.id, value: q.type === 'boolean' ? false : 'none' }) : await e.conversations.skip(id, { module: q.module, field: q.id });
  }
  expect(t.state).toBe('existing_client');
  return id;
}

describe('demo engine', () => {
  it('opens every conversation with the disclosures (guardrail 6)', async () => {
    const e = engine();
    const { turn } = await e.start('en');
    expect(turn.state).toBe('disclosures');
    expect(turn.messages.join(' ')).toMatch(/I am an AI/);
  });

  for (const lang of ['en', 'ne', 'bn'] as const) {
    describe(lang, () => {
      it('answers a fact question from the file, with the label (guardrail 7)', async () => {
        const e = engine();
        const id = await asClient(e, lang, 'per_sita_sharma');
        const t = await e.conversations.say(id, SUGGESTED_QUESTIONS[lang].fact[0]!);
        expect(t.reviewItemId).toBeUndefined();
        expect(t.messages[0]).toContain('2027-02-18');
        expect(t.messages[0]).toContain(factsNotAdviceLabel(lang));
      });

      it('routes a legal question to the attorney, and only the approved text reaches the client (guardrail 1)', async () => {
        const e = engine();
        const id = await asClient(e, lang, 'per_sita_sharma');
        const t = await e.conversations.say(id, SUGGESTED_QUESTIONS[lang].legal);
        expect(t.reviewItemId).toBeDefined();
        expect(await e.reviewQueue.clientAnswers('per_sita_sharma')).toEqual([]);
        const item = await e.reviewQueue.get(t.reviewItemId!);
        expect(item?.aiDraft).toMatch(/Our office will call you/);
        await e.decide(t.reviewItemId!, { decision: 'approve' });
        const answers = await e.reviewQueue.clientAnswers('per_sita_sharma');
        expect(answers).toHaveLength(1);
        expect(answers[0]!.answer).toBe(item!.aiDraft);
      });

      it('escalates an urgent message (guardrail 5)', async () => {
        const e = engine();
        const id = await asClient(e, lang, 'per_ram_sharma');
        const t = await e.conversations.say(id, SUGGESTED_QUESTIONS[lang].urgent);
        expect(t.escalation).toBeDefined();
        expect(await e.escalations.list()).toHaveLength(1);
      });
    });
  }

  it('runs a full new-client intake with the sample answers and writes it to the CRM', async () => {
    const e = engine();
    const { turn } = await e.start('en');
    const id = turn.conversationId;
    let t = await e.conversations.acceptDisclosures(id, { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true });
    let guard = 0;
    while (t.state !== 'playback' && guard++ < 80) {
      const q = t.question!;
      if (q.module === 'goal') { t = await e.conversations.setGoal(id, 'family'); continue; }
      const sample = SAMPLE_ANSWERS[`${q.module}.${q.id}`];
      t = sample === undefined
        ? await e.conversations.skip(id, { module: q.module, field: q.id })
        : await e.conversations.answer(id, { module: q.module, field: q.id, value: sample });
    }
    expect(t.state).toBe('playback');
    const done = await e.conversations.confirm(id);
    expect(done.state).toBe('end');
    const item = await e.reviewQueue.get(done.reviewItemId!);
    expect(item?.kind).toBe('assessment');
    expect(item?.aiDraft).toMatch(/Intake assessment/);
    const matters = e.matters();
    expect(matters).toHaveLength(1);
    expect(matters[0]!.person?.fullName).toBe('Maya Gurung');
    expect(matters[0]!.tasks[0]!.title).toMatch(/Attorney review/);
    expect(e.maskedANumber(matters[0]!.person)).toBe('A-***-***-321');
  });

  it('masks the seed A-number (guardrail 8)', async () => {
    const e = engine();
    expect(e.maskedANumber(await e.person('per_sita_sharma'))).toBe('A-***-***-101');
  });
});
