import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LANGS, type Logger, type Role } from '@chhetry/shared';
import type { AuditSink } from '@chhetry/db';
import type { CrmAdapter } from '@chhetry/crm';
import { needsNativeReview } from '@chhetry/i18n';
import {
  ConversationError, ReviewAlreadyDecidedError, ReviewDecisionError, ReviewNotFoundError, type ConversationService, type EscalationService, type ReviewQueue,
} from '@chhetry/agent';
import { CONSOLE_CSP, CONSOLE_FILES } from '@chhetry/review-console';
import { REVIEW_ROLES, STAFF_ROLES, type Authenticator, type Principal } from './auth.js';

export interface AppDeps {
  conversations: ConversationService;
  reviewQueue: ReviewQueue;
  escalations: EscalationService;
  crm: CrmAdapter;
  audit: AuditSink;
  logger: Logger;
  auth: Authenticator;
  /** Serve ne/bn while their text is a machine draft. Must be false in production until native review. */
  allowDraftLanguages: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const Lang = z.enum(LANGS as unknown as ['en', 'ne', 'bn']);
const Id = z.string().min(1).max(100);
const IdParams = z.object({ id: Id });

const Schemas = {
  start: z.object({ channel: z.enum(['app', 'phone', 'web']), lang: Lang }).strict(),
  disclosures: z.object({ aiDisclosureAck: z.boolean(), recordingConsent: z.boolean(), infoNotAdviceAck: z.boolean() }).strict(),
  field: z.object({ module: z.string().min(1).max(40), field: z.string().min(1).max(60), value: z.unknown(), unsure: z.boolean().optional() }).strict(),
  skip: z.object({ module: z.string().min(1).max(40), field: z.string().min(1).max(60) }).strict(),
  goal: z.object({ goal: z.enum(['family', 'employment', 'humanitarian', 'removal_defense', 'naturalization', 'status_question', 'other']) }).strict(),
  question: z.object({ conversationId: Id, text: z.string().min(1).max(4000) }).strict(),
  message: z.object({ text: z.string().min(1).max(4000) }).strict(),
  reviewList: z.object({ status: z.enum(['open', 'approved', 'edited_sent', 'call_client', 'rejected']).optional() }).strict(),
  decision: z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve') }).strict(),
    z.object({ decision: z.literal('edit_send'), finalText: z.string().min(1).max(20000) }).strict(),
    z.object({ decision: z.literal('call_client'), note: z.string().max(2000).optional() }).strict(),
    z.object({ decision: z.literal('reject'), note: z.string().max(2000).optional() }).strict(),
  ]),
  escalation: z.object({
    conversationId: Id,
    flags: z.array(z.enum(['detained', 'hearing_within_7_days', 'removal_order', 'ice_contact', 'deadline_within_14_days', 'stuck_abroad', 'danger'])).min(1),
  }).strict(),
};

function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new HttpError(400, `Invalid request: ${r.error.issues.map((i) => i.path.join('.') || i.message).join(', ')}`);
  return r.data;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // Fastify's own logger is off: it would log URLs and bodies. We log a redacted line per request instead.
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  app.decorateRequest('principal', null);
  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization;
    req.principal = h?.startsWith('Bearer ') ? await deps.auth.authenticate(h.slice(7)) : null;
  });
  app.addHook('onResponse', async (req, reply) => {
    deps.logger.info('http', { method: req.method, route: req.routeOptions.url ?? 'unmatched', status: reply.statusCode, ms: Math.round(reply.elapsedTime), role: req.principal?.role ?? null });
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof ConversationError) {
      const status = { not_found: 404, bad_state: 409, invalid: 400, forbidden: 403 }[err.code];
      return reply.status(status).send({ error: err.message });
    }
    if (err instanceof ReviewNotFoundError) return reply.status(404).send({ error: 'Not found' });
    if (err instanceof ReviewAlreadyDecidedError) return reply.status(409).send({ error: err.message });
    if (err instanceof ReviewDecisionError) return reply.status(400).send({ error: err.message });
    const e = err as { statusCode?: number };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'Bad request' });
    deps.logger.error('http.error', { err });
    return reply.status(500).send({ error: 'Internal error' });
  });

  const requireRole = (req: FastifyRequest, roles: readonly Role[]): Principal => {
    if (!req.principal) throw new HttpError(401, 'Authentication required');
    if (!roles.includes(req.principal.role)) {
      deps.audit.write({ actorType: 'user', actorId: req.principal.id, actorRole: req.principal.role, action: 'tool.denied', entityType: 'Route', metadata: { route: req.routeOptions.url ?? '' } });
      throw new HttpError(403, 'Forbidden');
    }
    return req.principal;
  };

  /** Conversation endpoints are open to new callers but bound to the token issued at start. */
  const requireConversation = (req: FastifyRequest, id: string) => {
    const tok = req.headers['x-conversation-token'];
    if (typeof tok !== 'string' || !deps.conversations.verifyToken(id, tok)) throw new HttpError(404, 'Conversation not found');
  };

  app.get('/healthz', async () => ({ ok: true }));

  // ---------- conversations (text-first; voice sessions in Milestone 2) ----------

  app.post('/v1/conversations', async (req, reply) => {
    const body = parse(Schemas.start, req.body);
    if (!deps.allowDraftLanguages && needsNativeReview(body.lang)) throw new HttpError(422, `Language ${body.lang} is not yet approved for clients`);
    // An authenticated client is identified by their app session (CLAUDE.md section 9: identify -> existing_client).
    const p = req.principal;
    const verifiedPersonId = p?.role === 'client' ? p.personId : undefined;
    const { token, turn } = await deps.conversations.start({ ...body, ...(verifiedPersonId ? { verifiedPersonId } : {}) });
    return reply.status(201).send({ conversationId: turn.conversationId, token, turn });
  });

  app.post('/v1/conversations/:id/disclosures', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    return deps.conversations.acceptDisclosures(id, parse(Schemas.disclosures, req.body));
  });

  app.post('/v1/conversations/:id/messages', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    return deps.conversations.say(id, parse(Schemas.message, req.body).text);
  });

  app.post('/v1/conversations/:id/hangup', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    return deps.conversations.hangup(id);
  });

  /** Spec name (section 12). Same as posting a message to the conversation. */
  app.post('/v1/questions', async (req) => {
    const body = parse(Schemas.question, req.body);
    requireConversation(req, body.conversationId);
    return deps.conversations.say(body.conversationId, body.text);
  });

  // ---------- intake (keyed by conversation id; one intake per conversation) ----------

  app.post('/v1/intake/:id/fields', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    const b = parse(Schemas.field, req.body);
    return deps.conversations.answer(id, { module: b.module, field: b.field, value: b.value, ...(b.unsure ? { unsure: true } : {}) });
  });

  app.post('/v1/intake/:id/skip', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    return deps.conversations.skip(id, parse(Schemas.skip, req.body));
  });

  app.post('/v1/intake/:id/goal', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    return deps.conversations.setGoal(id, parse(Schemas.goal, req.body).goal);
  });

  app.post('/v1/intake/:id/corrections', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    const b = parse(Schemas.field, req.body);
    return deps.conversations.correct(id, { module: b.module, field: b.field, value: b.value });
  });

  /** Caller confirmed playback: run rules, draft assessment, queue for the attorney. */
  app.post('/v1/intake/:id/assess', async (req) => {
    const { id } = parse(IdParams, req.params);
    requireConversation(req, id);
    return deps.conversations.confirm(id);
  });

  // ---------- client app ----------

  app.get('/v1/me/cases', async (req) => {
    const p = requireRole(req, ['client']);
    if (!p.personId) throw new HttpError(403, 'Forbidden');
    deps.audit.write({ actorType: 'user', actorId: p.id, actorRole: 'client', action: 'case.read', entityType: 'Person', entityId: p.personId });
    return { cases: await deps.crm.getCases(p.personId) };
  });

  /** Attorney-approved answers only (guardrail 1). */
  app.get('/v1/me/answers', async (req) => {
    const p = requireRole(req, ['client']);
    if (!p.personId) throw new HttpError(403, 'Forbidden');
    deps.audit.write({ actorType: 'user', actorId: p.id, actorRole: 'client', action: 'review.read', entityType: 'Person', entityId: p.personId });
    return { answers: await deps.reviewQueue.clientAnswers(p.personId) };
  });

  // ---------- attorney review ----------

  app.get('/v1/review', async (req) => {
    const p = requireRole(req, REVIEW_ROLES);
    const q = parse(Schemas.reviewList, req.query);
    const items = await deps.reviewQueue.list(q.status ? { status: q.status } : {});
    deps.audit.write({ actorType: 'user', actorId: p.id, actorRole: p.role, action: 'review.read', entityType: 'ReviewItem', metadata: { count: items.length, status: q.status ?? 'all' } });
    return { items };
  });

  app.get('/v1/review/:id', async (req) => {
    const p = requireRole(req, REVIEW_ROLES);
    const { id } = parse(IdParams, req.params);
    const item = await deps.reviewQueue.get(id);
    if (!item) throw new HttpError(404, 'Not found');
    deps.audit.write({ actorType: 'user', actorId: p.id, actorRole: p.role, action: 'review.read', entityType: 'ReviewItem', entityId: id });
    return item;
  });

  app.post('/v1/review/:id/decision', async (req) => {
    const p = requireRole(req, REVIEW_ROLES);
    const { id } = parse(IdParams, req.params);
    return deps.reviewQueue.decide(id, p.id, parse(Schemas.decision, req.body));
  });

  // ---------- escalations ----------

  app.post('/v1/escalations', async (req, reply) => {
    const p = requireRole(req, STAFF_ROLES);
    const b = parse(Schemas.escalation, req.body);
    const conv = deps.conversations.get(b.conversationId);
    const esc = await deps.escalations.escalate({ conversationId: b.conversationId, channel: conv.channel, flags: b.flags, matchedPatterns: [`manual:${p.role}`], ...(conv.personId ? { personId: conv.personId } : {}) });
    return reply.status(201).send(esc);
  });

  app.get('/v1/escalations', async (req) => {
    requireRole(req, STAFF_ROLES);
    return { escalations: await deps.escalations.list() };
  });

  // ---------- review console ----------

  const sendConsole = (reply: FastifyReply, body: string, type: string) =>
    reply.header('content-type', type).header('content-security-policy', CONSOLE_CSP).header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').send(body);
  app.get('/console', async (_req, reply) => sendConsole(reply, CONSOLE_FILES.html, 'text/html; charset=utf-8'));
  app.get('/console/app.js', async (_req, reply) => sendConsole(reply, CONSOLE_FILES.js, 'text/javascript; charset=utf-8'));

  return app;
}
