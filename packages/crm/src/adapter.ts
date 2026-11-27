import type { CaseSummary, DocumentRef, Goal, IntakeRecord, Person } from '@chhetry/shared';

/**
 * Boundary to the firm's case-management CRM (system of record).
 * Source: CLAUDE.md section 11. Implementations: MockCrmAdapter (now), and
 * a crm4attorney.com adapter once its API and auth are confirmed.
 *
 * Implementations must not log PII and must audit every read and write
 * (guardrails 8 and 10); callers pass the audit context via the gateway layer.
 */
export interface CrmAdapter {
  findPerson(query: { phone?: string; email?: string; aNumber?: string }): Promise<Person | null>;
  upsertPerson(p: Partial<Person>): Promise<Person>;
  getCases(personId: string): Promise<CaseSummary[]>;
  getDocuments(personId: string): Promise<DocumentRef[]>;
  createMatter(personId: string, goal: Goal): Promise<{ matterId: string }>;
  writeIntake(matterId: string, intake: IntakeRecord): Promise<void>;
  attachTranscript(matterId: string, ref: string, summary: string): Promise<void>;
  createTask(matterId: string, task: { title: string; due?: string; assignee?: string }): Promise<void>;
}

export class CrmNotFoundError extends Error {
  override name = 'CrmNotFoundError';
}
