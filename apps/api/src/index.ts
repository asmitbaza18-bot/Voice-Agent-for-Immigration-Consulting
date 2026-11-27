import { randomBytes } from 'node:crypto';
import { createLogger, type Logger } from '@chhetry/shared';
import { MemoryAuditSink, parseKeyRing, type KeyRing } from '@chhetry/db';
import { MockCrmAdapter } from '@chhetry/crm';
import {
  AnthropicLlmAdapter, ConversationService, InMemoryEscalationService, InMemoryReviewQueue, type LlmAdapter,
} from '@chhetry/agent';
import { buildApp, type AppDeps } from './app.js';
import { DevTokenAuthenticator, type Authenticator, type Principal } from './auth.js';

export { buildApp, type AppDeps } from './app.js';
export * from './auth.js';

/** 'YYYY-MM-DD' in the firm's time zone. Default is a placeholder until the firm confirms its office time zone. */
export function todayIn(timeZone: string): () => string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return () => f.format(new Date());
}

export interface DevDepsOptions {
  logger?: Logger;
  keyRing?: KeyRing;
  auth?: Authenticator;
  tokens?: Record<string, Principal>;
  llm?: LlmAdapter;
  today?: () => string;
  allowDraftLanguages?: boolean;
}

/**
 * Wires the in-memory implementations: MockCrmAdapter with the Sharma seed,
 * in-memory review queue, escalations and audit. For local dev and tests only.
 */
export function createDevDeps(opts: DevDepsOptions = {}): AppDeps & { audit: MemoryAuditSink } {
  const logger = opts.logger ?? createLogger();
  const keyRing = opts.keyRing ?? parseKeyRing(`dev:${randomBytes(32).toString('base64')}`);
  const audit = new MemoryAuditSink();
  const crm = new MockCrmAdapter({ keyRing, hmacKey: randomBytes(32) });
  const reviewQueue = new InMemoryReviewQueue({ keyRing, audit });
  const escalations = new InMemoryEscalationService({ audit });
  const today = opts.today ?? todayIn(process.env.FIRM_TIME_ZONE ?? 'America/New_York');
  const conversations = new ConversationService({
    crm, reviewQueue, escalations, audit, logger, keyRing, today, ...(opts.llm ? { llm: opts.llm } : {}),
  });
  return {
    conversations, reviewQueue, escalations, crm, audit, logger,
    auth: opts.auth ?? new DevTokenAuthenticator(opts.tokens ?? {}),
    allowDraftLanguages: opts.allowDraftLanguages ?? true,
  };
}

export async function buildDevApp(opts: DevDepsOptions = {}) {
  const deps = createDevDeps(opts);
  return { app: await buildApp(deps), deps };
}

export { AnthropicLlmAdapter };
