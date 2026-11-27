import { randomBytes } from 'node:crypto';
import { createLogger, type Lang } from '@chhetry/shared';
import { MemoryAuditSink, parseKeyRing } from '@chhetry/db';
import { MockCrmAdapter } from '@chhetry/crm';
import { ConversationService, FakeLlmAdapter, InMemoryEscalationService, InMemoryReviewQueue, type TurnResult } from '../src/index.js';

export const TODAY = '2026-11-27';

export function setup(opts: { llm?: FakeLlmAdapter } = {}) {
  const keyRing = parseKeyRing(`k1:${randomBytes(32).toString('base64')}`);
  const crm = new MockCrmAdapter({ keyRing, hmacKey: randomBytes(32) });
  const audit = new MemoryAuditSink();
  const logs: string[] = [];
  const logger = createLogger({ sink: (l) => logs.push(l), level: 'debug' });
  const reviewQueue = new InMemoryReviewQueue({ keyRing, audit });
  const escalations = new InMemoryEscalationService({ audit });
  const svc = new ConversationService({
    crm, reviewQueue, escalations, audit, logger, keyRing, today: () => TODAY,
    ...(opts.llm ? { llm: opts.llm } : {}),
  });
  return { svc, crm, audit, logs, reviewQueue, escalations, keyRing };
}

export const CLEAR_TRIAGE: Record<string, unknown> = {
  detained: false, has_nta_or_removal_order: 'none', ice_contact: false, upcoming_deadline: false, stuck_abroad: false, in_danger: false,
};

/** Answers or skips questions until the module changes. */
export async function answerModule(svc: ConversationService, turn: TurnResult, answers: Record<string, unknown>, stopAt?: string): Promise<TurnResult> {
  const module = turn.question?.module;
  let t = turn;
  while (t.question && t.question.module === module && t.question.id !== stopAt) {
    const q = t.question;
    if (q.id in answers) t = await svc.answer(t.conversationId, { module: q.module, field: q.id, value: answers[q.id] });
    else t = await svc.skip(t.conversationId, { module: q.module, field: q.id });
  }
  return t;
}

export async function startClear(svc: ConversationService, lang: Lang = 'en', verifiedPersonId?: string) {
  const { token, turn } = await svc.start({ channel: 'app', lang, ...(verifiedPersonId ? { verifiedPersonId } : {}) });
  let t = await svc.acceptDisclosures(turn.conversationId, { aiDisclosureAck: true, recordingConsent: true, infoNotAdviceAck: true });
  t = await answerModule(svc, t, CLEAR_TRIAGE);
  return { token, turn: t };
}
