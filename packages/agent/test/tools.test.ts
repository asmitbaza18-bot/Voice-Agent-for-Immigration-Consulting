import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@chhetry/shared';
import { MemoryAuditSink, parseKeyRing } from '@chhetry/db';
import { MockCrmAdapter } from '@chhetry/crm';
import {
  InMemoryEscalationService, InMemoryReviewQueue, invokeTool, ReviewAlreadyDecidedError, ToolArgumentError, ToolPermissionError,
  toolJsonSchemas, type ToolDeps,
} from '../src/index.js';

function deps(): ToolDeps & { audit: MemoryAuditSink; reviewQueue: InMemoryReviewQueue } {
  const keyRing = parseKeyRing(`k1:${randomBytes(32).toString('base64')}`);
  const audit = new MemoryAuditSink();
  return {
    crm: new MockCrmAdapter({ keyRing, hmacKey: randomBytes(32) }),
    intakes: { intakeBelongsTo: (i, c) => i === 'int_1' && c === 'conv_1', saveField: () => {} },
    reviewQueue: new InMemoryReviewQueue({ keyRing, audit }),
    escalations: new InMemoryEscalationService({ audit }),
    audit,
    logger: createLogger({ sink: () => {} }),
    today: () => '2026-11-27',
  };
}

describe('tool permissions and validation', () => {
  it('a client can read only their own case facts', async () => {
    const d = deps();
    const facts = await invokeTool(d, { actor: { type: 'user', role: 'client', personId: 'per_sita_sharma' } }, 'getCaseFacts', { personId: 'per_sita_sharma' });
    expect(facts.cases.length).toBe(2);
    await expect(invokeTool(d, { actor: { type: 'user', role: 'client', personId: 'per_sita_sharma' } }, 'getCaseFacts', { personId: 'per_ram_sharma' })).rejects.toThrow(ToolPermissionError);
    expect(d.audit.entries().map((e) => e.action)).toEqual(['case.read', 'tool.denied']);
  });

  it('staff can read any case facts', async () => {
    const d = deps();
    await expect(invokeTool(d, { actor: { type: 'user', role: 'staff', id: 'stf_1' } }, 'getCaseFacts', { personId: 'per_ram_sharma' })).resolves.toBeDefined();
  });

  it('the agent reads only the person the conversation is about', async () => {
    const d = deps();
    const call = { actor: { type: 'agent' as const }, conversationId: 'conv_1', conversationPersonId: 'per_ram_sharma' };
    await expect(invokeTool(d, call, 'getCaseFacts', { personId: 'per_ram_sharma' })).resolves.toBeDefined();
    await expect(invokeTool(d, call, 'getCaseFacts', { personId: 'per_sita_sharma' })).rejects.toThrow(ToolPermissionError);
  });

  it('saveIntakeField is bound to its conversation and validates the value', async () => {
    const d = deps();
    const ok = { intakeId: 'int_1', module: 'triage', field: 'detained', value: false, confidence: 'confirmed' };
    await expect(invokeTool(d, { actor: { type: 'agent' }, conversationId: 'conv_1' }, 'saveIntakeField', ok)).resolves.toEqual({ saved: true });
    await expect(invokeTool(d, { actor: { type: 'agent' }, conversationId: 'conv_2' }, 'saveIntakeField', ok)).rejects.toThrow(ToolPermissionError);
    await expect(invokeTool(d, { actor: { type: 'agent' }, conversationId: 'conv_1' }, 'saveIntakeField', { ...ok, value: 'yes' })).rejects.toThrow(ToolArgumentError);
    const audit = d.audit.entries().find((e) => e.action === 'intake.field.write');
    expect(audit?.metadata).toMatchObject({ module: 'triage', field: 'detained' });
  });

  it('rejects malformed arguments with zod', async () => {
    const d = deps();
    await expect(invokeTool(d, { actor: { type: 'agent' } }, 'getCaseFacts', { personId: '' })).rejects.toThrow(ToolArgumentError);
    await expect(invokeTool(d, { actor: { type: 'agent' } }, 'getCaseFacts', { personId: 'x', extra: 1 })).rejects.toThrow(ToolArgumentError);
  });

  it('runRules is not callable by a client', async () => {
    const d = deps();
    await expect(invokeTool(d, { actor: { type: 'user', role: 'client', personId: 'p' } }, 'runRules', { intakeId: 'i', input: { modules: {} } })).rejects.toThrow(ToolPermissionError);
  });

  it('exports JSON schemas for every tool', () => {
    const names = toolJsonSchemas().map((t) => t.name);
    expect(names).toEqual(['getCaseFacts', 'saveIntakeField', 'runRules', 'classifyQuestion', 'createReviewItem', 'escalate']);
  });
});

describe('review queue', () => {
  it('stores text encrypted and returns it decrypted to the attorney', async () => {
    const d = deps();
    const item = await d.reviewQueue.create({ kind: 'legal_question', personId: 'per_ram_sharma', question: 'Can I travel?', aiDraft: 'draft' });
    expect(item).toMatchObject({ status: 'open', question: 'Can I travel?', aiDraft: 'draft' });
    const raw = JSON.stringify((d.reviewQueue as unknown as { items: Map<string, unknown> }).items.get(item.id));
    expect(raw).not.toContain('Can I travel?');
    expect(raw).toContain('enc:v1:');
  });

  it('approve publishes the draft; reject and call_client publish nothing', async () => {
    const d = deps();
    const a = await d.reviewQueue.create({ kind: 'legal_question', personId: 'p1', question: 'q1', aiDraft: 'A1' });
    const b = await d.reviewQueue.create({ kind: 'legal_question', personId: 'p1', question: 'q2', aiDraft: 'A2' });
    const c = await d.reviewQueue.create({ kind: 'legal_question', personId: 'p1', question: 'q3', aiDraft: 'A3' });
    await d.reviewQueue.decide(a.id, 'atty', { decision: 'approve' });
    await d.reviewQueue.decide(b.id, 'atty', { decision: 'reject' });
    await d.reviewQueue.decide(c.id, 'atty', { decision: 'call_client' });
    expect((await d.reviewQueue.clientAnswers('p1')).map((x) => x.answer)).toEqual(['A1']);
    expect(d.audit.entries().map((e) => e.action).filter((x) => x.startsWith('review.'))).toEqual(['review.create', 'review.create', 'review.create', 'review.approve', 'review.reject', 'review.call_client']);
  });

  it('cannot decide twice, and edit_send needs text', async () => {
    const d = deps();
    const a = await d.reviewQueue.create({ kind: 'legal_question', personId: 'p1', aiDraft: 'A1' });
    await expect(d.reviewQueue.decide(a.id, 'atty', { decision: 'edit_send', finalText: '  ' })).rejects.toThrow(/finalText/);
    await d.reviewQueue.decide(a.id, 'atty', { decision: 'reject' });
    await expect(d.reviewQueue.decide(a.id, 'atty', { decision: 'approve' })).rejects.toThrow(ReviewAlreadyDecidedError);
  });

  it('a placeholder draft cannot be approved as-is', async () => {
    const d = deps();
    const a = await d.reviewQueue.create({ kind: 'legal_question', personId: 'p1', aiDraft: '(No AI draft.)' });
    await expect(d.reviewQueue.decide(a.id, 'atty', { decision: 'approve' })).rejects.toThrow(/no draft/);
    await d.reviewQueue.decide(a.id, 'atty', { decision: 'edit_send', finalText: 'Real answer' });
    expect((await d.reviewQueue.clientAnswers('p1'))[0]?.answer).toBe('Real answer');
  });

  it('assessments never appear as client answers', async () => {
    const d = deps();
    const a = await d.reviewQueue.create({ kind: 'assessment', personId: 'p1', aiDraft: 'memo' });
    await d.reviewQueue.decide(a.id, 'atty', { decision: 'approve' });
    expect(await d.reviewQueue.clientAnswers('p1')).toEqual([]);
  });
});
