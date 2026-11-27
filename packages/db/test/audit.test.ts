import { describe, expect, it } from 'vitest';
import { buildAuditEntry } from '../src/index.js';

describe('buildAuditEntry', () => {
  it('keeps ids and field names but strips values that look like PII', () => {
    const e = buildAuditEntry({
      actorType: 'agent', action: 'intake.field.write', entityType: 'IntakeRecord', entityId: 'int_1',
      metadata: { module: 'history', field: 'a_number', aNumber: 'A123456789', note: 'caller said A-123-456-789' },
    });
    expect(e.metadata).toMatchObject({ module: 'history', field: 'a_number', aNumber: '[REDACTED]' });
    expect(JSON.stringify(e)).not.toMatch(/123456789|123-456-789/);
    expect(e.actorId).toBeNull();
  });
});
