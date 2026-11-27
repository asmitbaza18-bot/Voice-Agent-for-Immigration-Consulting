import { describe, expect, it } from 'vitest';
import { createLogger, isSensitiveKey, redact, redactString, REDACTED } from '../src/index.js';

function capture() {
  const lines: string[] = [];
  const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l), now: () => new Date('2026-01-01T00:00:00Z') });
  return { lines, logger, last: () => JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown> };
}

describe('redact by field name', () => {
  it.each([
    'aNumber', 'a_number', 'A-Number', 'ssn', 'fullName', 'phone', 'email', 'transcript',
    'criminalHistory', 'arrests_charges_convictions', 'persecutionDetails', 'fear_of_return',
    'immigrationStatus', 'current_status', 'password', 'accessToken', 'Authorization',
  ])('treats %s as sensitive', (k) => {
    expect(isSensitiveKey(k)).toBe(true);
  });

  it.each(['caseId', 'lang', 'channel', 'state', 'goal', 'durationMs', 'rulesVersion'])('leaves %s alone', (k) => {
    expect(isSensitiveKey(k)).toBe(false);
  });

  it('redacts nested keys and arrays without mutating the input', () => {
    const input = { person: { fullName: 'Sita Sharma', aNumber: 'A123456789', lang: 'ne' }, items: [{ email: 'x@y.com' }] };
    const out = redact(input) as typeof input;
    expect(out.person.fullName).toBe(REDACTED);
    expect(out.person.aNumber).toBe(REDACTED);
    expect(out.person.lang).toBe('ne');
    expect(out.items[0]?.email).toBe(REDACTED);
    expect(input.person.fullName).toBe('Sita Sharma');
  });

  it('handles cycles', () => {
    const a: Record<string, unknown> = { id: '1' };
    a.self = a;
    expect(redact(a)).toEqual({ id: '1', self: '[CIRCULAR]' });
  });
});

describe('redact by pattern', () => {
  it.each([
    ['A-number plain', 'client A123456789 called', 'A123456789'],
    ['A-number dashed', 'A-123-456-789', '123-456-789'],
    ['A-number 8 digits', 'A12345678', 'A12345678'],
    ['receipt', 'receipt IOE0912345678 pending', 'IOE0912345678'],
    ['email', 'contact sita.sharma@example.com', 'sita.sharma@example.com'],
    ['US phone', 'call (555) 123-4567', '123-4567'],
    ['Nepal phone', '+977 980 123 4567', '980 123 4567'],
    ['SSN', 'ssn 123-45-6789', '123-45-6789'],
    ['ciphertext', 'enc:v1:k1:aaaa:bbbb:cccc', 'enc:v1'],
  ])('%s', (_label, input, leaked) => {
    const out = redactString(input);
    expect(out).not.toContain(leaked);
    expect(out).toContain('[REDACTED');
  });

  it('keeps ordinary text, dates and small numbers', () => {
    expect(redactString('hearing on 2026-12-03 at 9:30, 3 documents missing')).toBe('hearing on 2026-12-03 at 9:30, 3 documents missing');
  });
});

describe('logger', () => {
  it('writes JSON lines with redacted message and fields', () => {
    const { logger, last } = capture();
    logger.info('lookup for A123456789', { aNumber: 'A123456789', caseId: 'case_1', note: 'email sita@example.com' });
    const line = last();
    expect(line).toMatchObject({ level: 'info', caseId: 'case_1', aNumber: REDACTED });
    expect(JSON.stringify(line)).not.toMatch(/A123456789|sita@example\.com/);
  });

  it('redacts error messages and stacks', () => {
    const { logger, lines } = capture();
    logger.error('crm failed', { err: new Error('no person with A-123-456-789') });
    expect(lines.join('\n')).not.toContain('123-456-789');
  });

  it('redacts child base fields', () => {
    const { logger, lines } = capture();
    logger.child({ email: 'ram@example.com', conversationId: 'c1' }).warn('x');
    expect(lines[0]).toContain('"conversationId":"c1"');
    expect(lines[0]).not.toContain('ram@example.com');
  });

  it('respects level', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'warn', sink: (l) => lines.push(l) });
    logger.info('hidden');
    logger.warn('shown');
    expect(lines).toHaveLength(1);
  });
});
