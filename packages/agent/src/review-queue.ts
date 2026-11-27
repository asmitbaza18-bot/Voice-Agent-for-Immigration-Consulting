import { randomUUID } from 'node:crypto';
import type { ReviewItem } from '@chhetry/shared';
import { decryptField, encryptField, ENCRYPTED_COLUMNS, type AuditSink, type KeyRing } from '@chhetry/db';

/**
 * Attorney review queue (guardrail 1). Every legal question and every intake
 * assessment lands here. Only text an attorney approved or edited may reach
 * the client, through `clientAnswers`.
 */

export type ReviewDecision =
  | { decision: 'approve' }
  | { decision: 'edit_send'; finalText: string }
  | { decision: 'call_client'; note?: string }
  | { decision: 'reject'; note?: string };

export interface NewReviewItem {
  kind: ReviewItem['kind'];
  personId: string;
  question?: string;
  aiDraft: string;
  reason?: string;
  assessmentId?: string;
}

export interface ReviewQueue {
  create(item: NewReviewItem): Promise<ReviewItem>;
  list(filter?: { status?: ReviewItem['status']; personId?: string }): Promise<ReviewItem[]>;
  get(id: string): Promise<ReviewItem | null>;
  decide(id: string, attorneyId: string, d: ReviewDecision): Promise<ReviewItem>;
  /** Attorney-approved answers for a client. Never returns the unreviewed draft. */
  clientAnswers(personId: string): Promise<{ id: string; question?: string; answer: string; decidedAt: string }[]>;
}

/** Drafts that start with this are placeholders, not answers. They cannot be approved as-is. */
export const NO_DRAFT_PREFIX = '(No AI draft';

export class ReviewDecisionError extends Error {
  override name = 'ReviewDecisionError';
}

export class ReviewNotFoundError extends Error {
  override name = 'ReviewNotFoundError';
}
export class ReviewAlreadyDecidedError extends Error {
  override name = 'ReviewAlreadyDecidedError';
}

interface StoredItem {
  id: string;
  kind: ReviewItem['kind'];
  personId: string;
  questionEnc?: string;
  aiDraftEnc: string;
  finalTextEnc?: string;
  reason?: string;
  assessmentId?: string;
  status: ReviewItem['status'];
  attorneyId?: string;
  createdAt: string;
  decidedAt?: string;
}

const STATUS_FOR: Record<ReviewDecision['decision'], ReviewItem['status']> = {
  approve: 'approved',
  edit_send: 'edited_sent',
  call_client: 'call_client',
  reject: 'rejected',
};

const AUDIT_FOR = {
  approve: 'review.approve',
  edit_send: 'review.edit_send',
  call_client: 'review.call_client',
  reject: 'review.reject',
} as const;

/**
 * In-memory queue for dev and tests. Question, draft and final text are
 * field-encrypted at rest, as the ReviewItem table stores them.
 */
export class InMemoryReviewQueue implements ReviewQueue {
  private readonly items = new Map<string, StoredItem>();

  constructor(
    private readonly deps: { keyRing: KeyRing; audit: AuditSink; now?: () => Date; newId?: () => string },
  ) {}

  private now() {
    return (this.deps.now ?? (() => new Date()))().toISOString();
  }

  private enc(v: string, ctx: string) {
    return encryptField(v, ctx, this.deps.keyRing);
  }

  private view(s: StoredItem): ReviewItem {
    const dec = (v: string | undefined, ctx: string) => (v ? decryptField(v, ctx, this.deps.keyRing) : undefined);
    const out: ReviewItem = {
      id: s.id, kind: s.kind, personId: s.personId, status: s.status,
      aiDraft: dec(s.aiDraftEnc, ENCRYPTED_COLUMNS.reviewAiDraft)!,
      createdAt: s.createdAt,
    };
    const q = dec(s.questionEnc, ENCRYPTED_COLUMNS.reviewQuestion);
    if (q !== undefined) out.question = q;
    const f = dec(s.finalTextEnc, ENCRYPTED_COLUMNS.reviewFinalText);
    if (f !== undefined) out.finalText = f;
    if (s.reason) out.reason = s.reason;
    if (s.assessmentId) out.assessmentId = s.assessmentId;
    if (s.attorneyId) out.attorneyId = s.attorneyId;
    if (s.decidedAt) out.decidedAt = s.decidedAt;
    return out;
  }

  async create(item: NewReviewItem): Promise<ReviewItem> {
    const id = `rev_${(this.deps.newId ?? randomUUID)()}`;
    const stored: StoredItem = {
      id, kind: item.kind, personId: item.personId, status: 'open', createdAt: this.now(),
      aiDraftEnc: this.enc(item.aiDraft, ENCRYPTED_COLUMNS.reviewAiDraft),
    };
    if (item.question) stored.questionEnc = this.enc(item.question, ENCRYPTED_COLUMNS.reviewQuestion);
    if (item.reason) stored.reason = item.reason;
    if (item.assessmentId) stored.assessmentId = item.assessmentId;
    this.items.set(id, stored);
    this.deps.audit.write({ actorType: 'agent', action: 'review.create', entityType: 'ReviewItem', entityId: id, metadata: { kind: item.kind, reason: item.reason ?? null } });
    return this.view(stored);
  }

  async list(filter: { status?: ReviewItem['status']; personId?: string } = {}): Promise<ReviewItem[]> {
    return [...this.items.values()]
      .filter((i) => (!filter.status || i.status === filter.status) && (!filter.personId || i.personId === filter.personId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((i) => this.view(i));
  }

  async get(id: string): Promise<ReviewItem | null> {
    const s = this.items.get(id);
    return s ? this.view(s) : null;
  }

  async decide(id: string, attorneyId: string, d: ReviewDecision): Promise<ReviewItem> {
    const s = this.items.get(id);
    if (!s) throw new ReviewNotFoundError(`Review item ${id} not found`);
    if (s.status !== 'open') throw new ReviewAlreadyDecidedError(`Review item ${id} is already ${s.status}`);
    if (d.decision === 'edit_send' && !d.finalText.trim()) throw new ReviewDecisionError('finalText is required for edit_send');
    if (d.decision === 'approve' && this.view(s).aiDraft.startsWith(NO_DRAFT_PREFIX)) throw new ReviewDecisionError('There is no draft to approve; use edit_send with your answer');
    s.status = STATUS_FOR[d.decision];
    s.attorneyId = attorneyId;
    s.decidedAt = this.now();
    if (d.decision === 'approve') s.finalTextEnc = this.enc(this.view(s).aiDraft, ENCRYPTED_COLUMNS.reviewFinalText);
    if (d.decision === 'edit_send') s.finalTextEnc = this.enc(d.finalText.trim(), ENCRYPTED_COLUMNS.reviewFinalText);
    this.deps.audit.write({ actorType: 'user', actorId: attorneyId, actorRole: 'attorney', action: AUDIT_FOR[d.decision], entityType: 'ReviewItem', entityId: id, metadata: { kind: s.kind } });
    return this.view(s);
  }

  async clientAnswers(personId: string) {
    return [...this.items.values()]
      .filter((i) => i.personId === personId && i.kind === 'legal_question' && (i.status === 'approved' || i.status === 'edited_sent') && i.finalTextEnc)
      .map((i) => {
        const v = this.view(i);
        const out: { id: string; question?: string; answer: string; decidedAt: string } = { id: v.id, answer: v.finalText!, decidedAt: v.decidedAt! };
        if (v.question) out.question = v.question;
        return out;
      });
  }
}
