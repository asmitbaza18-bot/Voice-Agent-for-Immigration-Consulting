import { redact } from '@chhetry/shared';
import type { Role } from '@chhetry/shared';

/** Guardrail 10: every read/write of client data, every AI output, every attorney approval. */
export type AuditAction =
  | 'person.read' | 'person.write'
  | 'case.read' | 'document.read' | 'document.write'
  | 'conversation.start' | 'conversation.disclosures_accepted'
  | 'intake.field.write' | 'intake.confirm'
  | 'assessment.create' | 'ai.output' | 'ai.output.blocked'
  | 'review.create' | 'review.approve' | 'review.edit_send' | 'review.call_client' | 'review.reject'
  | 'escalation.create' | 'crm.write'
  | 'tool.call' | 'tool.denied' | 'review.read';

export interface AuditEntryInput {
  actorType: 'user' | 'agent' | 'system';
  actorId?: string;
  actorRole?: Role;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Normalizes an audit entry before insert. Metadata is passed through the
 * PII redactor as a backstop: audit rows record *that* a field was touched,
 * not its value.
 */
export function buildAuditEntry(input: AuditEntryInput) {
  return {
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    requestId: input.requestId ?? null,
    metadata: (redact(input.metadata ?? {}) as Record<string, unknown>),
  };
}

export type AuditEntry = ReturnType<typeof buildAuditEntry> & { id: number; at: string };

/** Append-only audit sink. There is deliberately no update or delete. */
export interface AuditSink {
  write(input: AuditEntryInput): void;
}

/** In-memory sink for tests and local dev. Production writes to the AuditLog table. */
export class MemoryAuditSink implements AuditSink {
  private readonly rows: AuditEntry[] = [];
  constructor(private readonly now: () => Date = () => new Date()) {}

  write(input: AuditEntryInput): void {
    this.rows.push(Object.freeze({ ...buildAuditEntry(input), id: this.rows.length + 1, at: this.now().toISOString() }));
  }

  /** Read-only copy. */
  entries(): readonly AuditEntry[] {
    return [...this.rows];
  }
}
