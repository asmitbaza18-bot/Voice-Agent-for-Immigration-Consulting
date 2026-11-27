import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  blindIndex, blindIndexEquals, decryptField, decryptJson, encryptField, encryptJson, EncryptionError,
  isEncrypted, isSensitiveIntakeField, maskANumber, maskTail, normalizeANumber, parseKeyRing, rotateField,
} from '../src/index.js';

const k = () => randomBytes(32).toString('base64');
const K1 = k();
const K2 = k();
const ring = parseKeyRing(`k1:${K1}`);
const CTX = 'Person.aNumberEnc';

describe('encryptField / decryptField', () => {
  it('round-trips, including Nepali and Bengali text', () => {
    for (const s of ['A123456789', 'हिरासतमा छु', 'আমি আটক আছি', '']) {
      const c = encryptField(s, CTX, ring);
      expect(isEncrypted(c)).toBe(true);
      expect(c).not.toContain(s || '\u0000');
      expect(decryptField(c, CTX, ring)).toBe(s);
    }
  });

  it('uses a fresh IV each time', () => {
    expect(encryptField('A123456789', CTX, ring)).not.toBe(encryptField('A123456789', CTX, ring));
  });

  it('fails if ciphertext is moved to another column (AAD context)', () => {
    const c = encryptField('A123456789', CTX, ring);
    expect(() => decryptField(c, 'Person.immigrationStatusEnc', ring)).toThrow(EncryptionError);
  });

  it('fails on tampering', () => {
    const c = encryptField('A123456789', CTX, ring);
    const parts = c.split(':');
    const ct = Buffer.from(parts[5]!, 'base64url');
    ct[0] = ct[0]! ^ 1;
    parts[5] = ct.toString('base64url');
    expect(() => decryptField(parts.join(':'), CTX, ring)).toThrow(EncryptionError);
  });

  it('fails with the wrong key and does not leak the value in the error', () => {
    const c = encryptField('A123456789', CTX, ring);
    const other = parseKeyRing(`k1:${K2}`);
    try {
      decryptField(c, CTX, other);
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain('A123456789');
    }
  });

  it('rejects plaintext and malformed values', () => {
    expect(() => decryptField('A123456789', CTX, ring)).toThrow(EncryptionError);
    expect(() => decryptField('enc:v1:k1:abc', CTX, ring)).toThrow(EncryptionError);
  });

  it('round-trips JSON', () => {
    const v = { arrests_charges_convictions: [{ date: '2019-05-01', state: 'NY', outcome: 'dismissed' }] };
    expect(decryptJson(encryptJson(v, 'IntakeRecord.sensitiveModulesEnc', ring), 'IntakeRecord.sensitiveModulesEnc', ring)).toEqual(v);
  });
});

describe('key ring and rotation', () => {
  it('decrypts old values after rotation and re-encrypts under the new key', () => {
    const old = encryptField('secret', CTX, parseKeyRing(`k1:${K1}`));
    const rotated = parseKeyRing(`k2:${K2},k1:${K1}`);
    expect(decryptField(old, CTX, rotated)).toBe('secret');
    const re = rotateField(old, CTX, rotated);
    expect(re.split(':')[2]).toBe('k2');
    expect(decryptField(re, CTX, parseKeyRing(`k2:${K2}`))).toBe('secret');
  });

  it('validates keys', () => {
    expect(() => parseKeyRing('')).toThrow(EncryptionError);
    expect(() => parseKeyRing('k1:c2hvcnQ=')).toThrow(/32 bytes/);
    expect(() => parseKeyRing(`k1:${K1},k1:${K2}`)).toThrow(/Duplicate/);
    expect(() => parseKeyRing(`bad id:${K1}`)).toThrow(/Invalid key id/);
  });
});

describe('blind index', () => {
  const hk = randomBytes(32);
  it('is stable for the same normalized A-number and differs by kind', () => {
    const a = blindIndex(normalizeANumber('A-123-456-789'), 'aNumber', hk);
    const b = blindIndex(normalizeANumber('a123456789'), 'aNumber', hk);
    expect(blindIndexEquals(a, b)).toBe(true);
    expect(blindIndex('123456789', 'phone', hk)).not.toBe(a);
  });
  it('requires a strong key', () => {
    expect(() => blindIndex('x', 'aNumber', randomBytes(8))).toThrow(EncryptionError);
  });
});

describe('masking', () => {
  it('shows only the last 3 digits of an A-number', () => {
    expect(maskANumber('A123456789')).toBe('A-***-***-789');
    expect(maskANumber('A-12-345-678')).toBe('A-***-***-678');
  });
  it('normalizes 8-digit A-numbers and rejects junk', () => {
    expect(normalizeANumber('A12345678')).toBe('012345678');
    expect(() => normalizeANumber('A123')).toThrow(EncryptionError);
  });
  it('masks other identifiers', () => {
    expect(maskTail('IOE0912345678')).toBe('**********678');
    expect(maskTail('ab')).toBe('**');
  });
});

describe('sensitive intake fields', () => {
  it('routes guardrail 8 categories to encrypted storage', () => {
    expect(isSensitiveIntakeField('history', 'a_number')).toBe(true);
    expect(isSensitiveIntakeField('history', 'current_status')).toBe(true);
    expect(isSensitiveIntakeField('red_flags', 'anything')).toBe(true);
    expect(isSensitiveIntakeField('humanitarian', 'fear_of_return')).toBe(true);
    expect(isSensitiveIntakeField('core', 'city')).toBe(false);
  });
});
