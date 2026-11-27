import {
  ConversationService, InMemoryEscalationService, InMemoryReviewQueue, type ReviewDecision,
} from '@chhetry/agent';
import { MockCrmAdapter, SEED_PEOPLE } from '@chhetry/crm';
import { decryptField, ENCRYPTED_COLUMNS, maskANumber, MemoryAuditSink, parseKeyRing, type KeyRing } from '@chhetry/db';
import { createLogger, type Lang, type Logger, type Person } from '@chhetry/shared';
import { ScriptedDemoLlm } from './demo-llm.js';

/**
 * Wires the real Milestone 1 packages (agent, guardrails, rules, intake
 * schema, MockCrmAdapter, review queue, audit) the same way the API's
 * createDevDeps does, but in one process with no server. Mock data only.
 */

export const ATTORNEY_ID = 'atty_chhetry';

/** 'YYYY-MM-DD' in the firm's time zone (placeholder until the firm confirms it). */
export function todayIn(timeZone: string): () => string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return () => f.format(new Date());
}

function randomKey(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export interface DemoEngineOptions {
  today?: () => string;
  logSink?: (line: string) => void;
}

export function createDemoEngine(opts: DemoEngineOptions = {}) {
  const keyRing: KeyRing = parseKeyRing(`demo:${randomKey()}`);
  const hmac = new Uint8Array(32);
  globalThis.crypto.getRandomValues(hmac);
  const logLines: string[] = [];
  const logger: Logger = createLogger({ sink: opts.logSink ?? ((l) => logLines.push(l)) });
  const audit = new MemoryAuditSink();
  const crm = new MockCrmAdapter({ keyRing, hmacKey: Buffer.from(hmac) });
  const reviewQueue = new InMemoryReviewQueue({ keyRing, audit });
  const escalations = new InMemoryEscalationService({ audit });
  const today = opts.today ?? todayIn('America/New_York');
  const llm = new ScriptedDemoLlm(today);
  const conversations = new ConversationService({ crm, reviewQueue, escalations, audit, logger, keyRing, today, llm });
  const matterIds: string[] = [];
  const intakePeople = new Map<string, Person>();

  // Remember the people and matters an intake writes, so the firm view can show the CRM writeback.
  const createMatter = crm.createMatter.bind(crm);
  crm.createMatter = async (personId, goal) => {
    const r = await createMatter(personId, goal);
    matterIds.push(r.matterId);
    return r;
  };
  const upsertPerson = crm.upsertPerson.bind(crm);
  crm.upsertPerson = async (p) => {
    const r = await upsertPerson(p);
    intakePeople.set(r.id, r);
    return r;
  };

  return {
    conversations, reviewQueue, escalations, crm, audit, logger, logLines, today, keyRing,

    /** People clients can sign in as (seed data). */
    seedPeople: SEED_PEOPLE.map((p) => ({ id: p.id, fullName: p.fullName, preferredLang: p.preferredLang })),

    async person(id: string): Promise<Person | null> {
      for (const p of SEED_PEOPLE) if (p.id === id) return crm.findPerson({ phone: p.phone });
      return intakePeople.get(id) ?? null;
    },

    /** Guardrail 8: decrypt only to mask. The full A-number is never put on screen. */
    maskedANumber(p: Person | null): string | null {
      if (!p?.aNumber) return null;
      return maskANumber(decryptField(p.aNumber, ENCRYPTED_COLUMNS.personANumber, keyRing));
    },

    /** Matters written by intakes in this session, newest first. */
    matters() {
      return matterIds.flatMap((id) => {
        const m = crm.getMatter(id);
        return m ? [{ ...m, person: intakePeople.get(m.personId) ?? null }] : [];
      }).reverse();
    },

    decide(id: string, d: ReviewDecision) {
      return reviewQueue.decide(id, ATTORNEY_ID, d);
    },

    async personName(id: string): Promise<string> {
      return (await this.person(id))?.fullName ?? id;
    },

    start(lang: Lang, verifiedPersonId?: string) {
      return conversations.start({ channel: 'app', lang, ...(verifiedPersonId ? { verifiedPersonId } : {}) });
    },
  };
}

export type DemoEngine = ReturnType<typeof createDemoEngine>;
