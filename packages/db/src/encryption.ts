/**
 * Field-level encryption for sensitive columns (CLAUDE.md guardrail 8, section 13).
 *
 * - AES-256-GCM with a random 96-bit IV per value.
 * - Ciphertext format: `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>`, base64url parts.
 * - Key ring: the first key encrypts; every key decrypts, so keys can rotate.
 * - The `context` (e.g. 'Person.aNumberEnc') is bound as additional
 *   authenticated data, so ciphertext copied into another column fails to decrypt.
 * - Blind index: HMAC-SHA256 of a normalized value, for equality lookups.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EncryptedString } from '@chhetry/shared';

const VERSION = 'v1';
const PREFIX = `enc:${VERSION}:`;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export interface KeyRing {
  primaryKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

export class EncryptionError extends Error {
  override name = 'EncryptionError';
}

function decodeKey(id: string, b64: string): Buffer {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new EncryptionError(`Key ${id} must be 32 bytes (base64), got ${key.length}`);
  return key;
}

/** Parses `k2:base64,k1:base64`. The first entry is the primary (encrypting) key. */
export function parseKeyRing(spec: string): KeyRing {
  const keys = new Map<string, Buffer>();
  let primaryKeyId: string | undefined;
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(':');
    if (idx <= 0) throw new EncryptionError('Key entries must look like keyId:base64key');
    const id = part.slice(0, idx);
    if (!KEY_ID_RE.test(id)) throw new EncryptionError(`Invalid key id ${JSON.stringify(id)}`);
    if (keys.has(id)) throw new EncryptionError(`Duplicate key id ${id}`);
    keys.set(id, decodeKey(id, part.slice(idx + 1)));
    primaryKeyId ??= id;
  }
  if (!primaryKeyId) throw new EncryptionError('Key ring is empty');
  return { primaryKeyId, keys };
}

export function keyRingFromEnv(env: NodeJS.ProcessEnv = process.env): KeyRing {
  const spec = env.FIELD_ENCRYPTION_KEYS;
  if (!spec) throw new EncryptionError('FIELD_ENCRYPTION_KEYS is not set');
  return parseKeyRing(spec);
}

const b64u = (b: Buffer) => b.toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

export function isEncrypted(value: unknown): value is EncryptedString {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField(plaintext: string, context: string, ring: KeyRing): EncryptedString {
  const key = ring.keys.get(ring.primaryKeyId);
  if (!key) throw new EncryptionError('Primary key missing from ring');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${ring.primaryKeyId}:${b64u(iv)}:${b64u(tag)}:${b64u(ct)}` as EncryptedString;
}

export function decryptField(value: EncryptedString | string, context: string, ring: KeyRing): string {
  if (!isEncrypted(value)) throw new EncryptionError('Value is not field ciphertext');
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 4) throw new EncryptionError('Malformed ciphertext');
  const [keyId, ivS, tagS, ctS] = parts as [string, string, string, string];
  const key = ring.keys.get(keyId);
  if (!key) throw new EncryptionError(`Unknown key id ${keyId}`);
  const iv = fromB64u(ivS);
  const tag = fromB64u(tagS);
  if (iv.length !== 12 || tag.length !== 16) throw new EncryptionError('Malformed ciphertext');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(fromB64u(ctS)), decipher.final()]).toString('utf8');
  } catch {
    // Do not include the value or the underlying error text.
    throw new EncryptionError('Decryption failed (wrong key, wrong context, or tampered value)');
  }
}

/** Re-encrypts with the current primary key if the value used an older key. */
export function rotateField(value: EncryptedString, context: string, ring: KeyRing): EncryptedString {
  const keyId = value.slice(PREFIX.length).split(':')[0];
  if (keyId === ring.primaryKeyId) return value;
  return encryptField(decryptField(value, context, ring), context, ring);
}

export function encryptJson(value: unknown, context: string, ring: KeyRing): EncryptedString {
  return encryptField(JSON.stringify(value), context, ring);
}

export function decryptJson<T>(value: EncryptedString | string, context: string, ring: KeyRing): T {
  return JSON.parse(decryptField(value, context, ring)) as T;
}

/** Normalizes an A-number to 9 digits: 'A-12-345-678' -> '012345678'. */
export function normalizeANumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 9) throw new EncryptionError('A-number must have 8 or 9 digits');
  return digits.padStart(9, '0');
}

/** Keyed HMAC for equality lookups. `kind` separates indexes (aNumber vs phone). */
export function blindIndex(value: string, kind: string, hmacKey: Buffer | string): string {
  const key = typeof hmacKey === 'string' ? Buffer.from(hmacKey, 'base64') : hmacKey;
  if (key.length < 32) throw new EncryptionError('HMAC key must be at least 32 bytes');
  return createHmac('sha256', key).update(`${kind}\u0000${value}`, 'utf8').digest('base64url');
}

export function blindIndexEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * UI mask: show only the last `visible` digits (default 3, per guardrail 8).
 * 'A123456789' -> 'A-***-***-789'.
 */
export function maskANumber(plain: string, visible = 3): string {
  const digits = normalizeANumber(plain);
  const tail = digits.slice(-visible);
  return `A-***-***-${tail.padStart(3, '*')}`;
}

/** Generic mask for other identifiers: keeps the last `visible` characters. */
export function maskTail(plain: string, visible = 3): string {
  if (plain.length <= visible) return '*'.repeat(plain.length);
  return '*'.repeat(plain.length - visible) + plain.slice(-visible);
}
