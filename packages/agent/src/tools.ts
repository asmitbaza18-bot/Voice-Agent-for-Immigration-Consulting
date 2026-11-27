import { z } from 'zod';
import type { Channel, FieldValue, Role, UrgentFlag } from '@chhetry/shared';
import type { Logger } from '@chhetry/shared';
import type { AuditSink } from '@chhetry/db';
import type { CrmAdapter } from '@chhetry/crm';
import { classifyQuestion, type LlmLabeler } from '@chhetry/guardrails';
import { runRules, type RuleInput } from '@chhetry/rules';
import { validateAnswer } from '@chhetry/intake-schema';
import { loadCaseFacts } from './case-facts.js';
import type { ReviewQueue } from './review-queue.js';
import type { EscalationService } from './escalation.js';

/**
 * Agent tools (CLAUDE.md section 9). Each tool: zod-validated arguments,
 * a permission check, an audit row, and a log line with the tool name only.
 * In Milestone 1 the orchestrator calls these; the LLM does not.
 * `toolJsonSchemas()` exposes them for LLM tool use later.
 *
 * Not built yet (Milestone 3): explainDocument, bookConsult, sendUploadLink.
 */

export interface Actor {
  type: 'user' | 'agent';
  id?: string;
  role?: Role;
  /** For a client: the person they are. */
  personId?: string;
}

/** Where intake answers are saved. The conversation service implements it. */
export interface IntakeFieldStore {
  intakeBelongsTo(intakeId: string, conversationId: string): boolean;
  saveField(intakeId: string, module: string, field: string, value: FieldValue, confidence: 'confirmed' | 'unsure'): void;
}

export interface ToolDeps {
  crm: CrmAdapter;
  intakes: IntakeFieldStore;
  reviewQueue: ReviewQueue;
  escalations: EscalationService;
  audit: AuditSink;
  logger: Logger;
  llmLabeler?: LlmLabeler;
  today: () => string;
}

export interface ToolCall {
  actor: Actor;
  /** Conversation the call belongs to, for audit tracing. */
  conversationId?: string;
  /** The person the conversation is about, once identified. */
  conversationPersonId?: string;
}

const STAFF: ReadonlySet<Role> = new Set(['staff', 'attorney', 'management', 'admin', 'super_admin']);

/** Client may read only their own file; staff may read any. */
function canAccessPerson(call: ToolCall, personId: string): boolean {
  if (call.actor.role && STAFF.has(call.actor.role)) return true;
  if (call.actor.type === 'user') return call.actor.personId === personId;
  return call.conversationPersonId === personId;
}

const personId = z.string().min(1).max(100);

export const TOOLS = {
  getCaseFacts: {
    description: "Read-only case facts from the CRM for the conversation's person: cases, dates, steps, missing documents.",
    input: z.object({ personId }).strict(),
    allowed: (call: ToolCall, a: { personId: string }) => canAccessPerson(call, a.personId),
    run: (deps: ToolDeps, a: { personId: string }) => loadCaseFacts(deps.crm, a.personId),
    audit: 'case.read' as const,
    entity: 'Person',
  },
  saveIntakeField: {
    description: 'Save one typed intake answer. The value is validated against the intake schema; sensitive values arrive already encrypted.',
    input: z.object({
      intakeId: z.string().min(1),
      module: z.string().min(1).max(40),
      field: z.string().min(1).max(60),
      value: z.unknown(),
      confidence: z.enum(['confirmed', 'unsure']),
    }).strict(),
    allowed: (call: ToolCall, a: { intakeId: string }, deps: ToolDeps) =>
      !!call.conversationId && deps.intakes.intakeBelongsTo(a.intakeId, call.conversationId),
    run: async (deps: ToolDeps, a: { intakeId: string; module: string; field: string; value: unknown; confidence: 'confirmed' | 'unsure' }) => {
      const isEncrypted = typeof a.value === 'object' && a.value !== null && (a.value as { kind?: string }).kind === 'encrypted';
      const v = isEncrypted ? { ok: true as const, value: a.value as FieldValue } : validateAnswer(a.module, a.field, a.value);
      if (!v.ok) throw new ToolArgumentError(`Invalid value for ${a.module}.${a.field}`);
      deps.intakes.saveField(a.intakeId, a.module, a.field, v.value, a.confidence);
      return { saved: true as const };
    },
    audit: 'intake.field.write' as const,
    entity: 'IntakeRecord',
  },
  runRules: {
    description: 'Run the deterministic rules engine on intake answers. Returns red flags, deadlines and pathway hints.',
    input: z.object({
      intakeId: z.string().min(1),
      input: z.object({ goal: z.string().optional(), modules: z.record(z.string(), z.record(z.string(), z.unknown())), notices: z.array(z.unknown()).optional() }),
    }).strict(),
    allowed: (call: ToolCall) => call.actor.type === 'agent' || (!!call.actor.role && STAFF.has(call.actor.role)),
    run: async (deps: ToolDeps, a: { input: unknown }) => runRules(a.input as RuleInput, { today: deps.today() }),
    audit: 'assessment.create' as const,
    entity: 'IntakeRecord',
  },
  classifyQuestion: {
    description: 'Label a user turn: fact | general_info | legal_question | urgent | off_topic.',
    input: z.object({ text: z.string().min(1).max(4000) }).strict(),
    allowed: () => true,
    run: (deps: ToolDeps, a: { text: string }) => classifyQuestion(a.text, deps.llmLabeler),
    audit: null,
    entity: 'Conversation',
  },
  createReviewItem: {
    description: 'Queue a legal question or an assessment for attorney review.',
    input: z.object({
      kind: z.enum(['assessment', 'legal_question']),
      personId,
      question: z.string().max(4000).optional(),
      aiDraft: z.string().max(20000),
      reason: z.string().max(100).optional(),
      assessmentId: z.string().optional(),
    }).strict(),
    allowed: (call: ToolCall, a: { personId: string }) => canAccessPerson(call, a.personId),
    run: (deps: ToolDeps, a: Parameters<ReviewQueue['create']>[0]) => deps.reviewQueue.create(a),
    audit: null, // the queue writes review.create itself
    entity: 'ReviewItem',
  },
  escalate: {
    description: 'Urgent escalation: live transfer or on-call alert (guardrail 5).',
    input: z.object({
      conversationId: z.string().min(1),
      personId: personId.optional(),
      channel: z.enum(['app', 'phone', 'web']),
      flags: z.array(z.enum(['detained', 'hearing_within_7_days', 'removal_order', 'ice_contact', 'deadline_within_14_days', 'stuck_abroad', 'danger'])),
      matchedPatterns: z.array(z.string()).optional(),
    }).strict(),
    allowed: () => true, // anyone in danger may be escalated
    run: (deps: ToolDeps, a: { conversationId: string; personId?: string; channel: Channel; flags: UrgentFlag[]; matchedPatterns?: string[] }) => deps.escalations.escalate(a),
    audit: null, // the escalation service writes escalation.create itself
    entity: 'Conversation',
  },
} as const;

export type ToolName = keyof typeof TOOLS;

export class ToolPermissionError extends Error {
  override name = 'ToolPermissionError';
}
export class ToolArgumentError extends Error {
  override name = 'ToolArgumentError';
}

type ToolResult<N extends ToolName> = Awaited<ReturnType<(typeof TOOLS)[N]['run']>>;

/** The only way tools run. Validates, checks permission, audits, logs (name only). */
export async function invokeTool<N extends ToolName>(deps: ToolDeps, call: ToolCall, name: N, rawArgs: unknown): Promise<ToolResult<N>> {
  const tool = TOOLS[name];
  const parsed = tool.input.safeParse(rawArgs);
  if (!parsed.success) {
    deps.logger.warn('tool.invalid_args', { tool: name, issues: parsed.error.issues.map((i) => i.path.join('.')) });
    throw new ToolArgumentError(`Invalid arguments for ${name}`);
  }
  const args = parsed.data as never;
  const auditBase = {
    actorType: call.actor.type,
    ...(call.actor.id ? { actorId: call.actor.id } : {}),
    ...(call.actor.role ? { actorRole: call.actor.role } : {}),
    ...(call.conversationId ? { requestId: call.conversationId } : {}),
  };
  if (!(tool.allowed as (c: ToolCall, a: never, d: ToolDeps) => boolean)(call, args, deps)) {
    deps.audit.write({ ...auditBase, action: 'tool.denied', entityType: tool.entity, metadata: { tool: name } });
    deps.logger.warn('tool.denied', { tool: name });
    throw new ToolPermissionError(`Not allowed to call ${name}`);
  }
  const fieldMeta = name === 'saveIntakeField' ? { module: (args as { module: string }).module, field: (args as { field: string }).field } : {};
  deps.audit.write({ ...auditBase, action: tool.audit ?? 'tool.call', entityType: tool.entity, metadata: { tool: name, ...fieldMeta } });
  deps.logger.info('tool.call', { tool: name });
  return (tool.run as unknown as (d: ToolDeps, a: never) => Promise<ToolResult<N>>)(deps, args);
}

/** JSON Schemas for LLM tool use (later milestones). */
export function toolJsonSchemas() {
  return (Object.keys(TOOLS) as ToolName[]).map((name) => ({
    name,
    description: TOOLS[name].description,
    input_schema: z.toJSONSchema(TOOLS[name].input),
  }));
}
