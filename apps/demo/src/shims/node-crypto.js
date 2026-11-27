// Browser-only stand-in for the parts of node:crypto the packages use.
// AES-256-GCM and SHA-256/HMAC from audited pure-JS libraries (@noble), random bytes from Web Crypto.
import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { Buffer } from './buffer-global.js';

const bytes = (v, enc) => (typeof v === 'string' ? Buffer.from(v, enc ?? 'utf8') : v);
const out = (u8, enc) => { const b = Buffer.from(u8); return enc ? b.toString(enc) : b; };

export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Buffer.from(b);
}

export function randomUUID() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function hasher(make) {
  const chunks = [];
  const api = {
    update(v, enc) { chunks.push(bytes(v, enc)); return api; },
    digest(enc) { return out(make(Buffer.concat(chunks)), enc); },
  };
  return api;
}

export function createHash(alg) {
  if (alg !== 'sha256') throw new Error(`demo crypto: unsupported hash ${alg}`);
  return hasher((data) => sha256(data));
}

export function createHmac(alg, key) {
  if (alg !== 'sha256') throw new Error(`demo crypto: unsupported hmac ${alg}`);
  return hasher((data) => hmac(sha256, bytes(key), data));
}

function gcmStream(alg, key, iv, encrypt) {
  if (alg !== 'aes-256-gcm') throw new Error(`demo crypto: unsupported cipher ${alg}`);
  let aad; let tag; let result;
  const chunks = [];
  return {
    setAAD(v) { aad = bytes(v); return this; },
    setAuthTag(v) { tag = bytes(v); return this; },
    update(v, enc) { chunks.push(bytes(v, enc)); return Buffer.alloc(0); },
    final() {
      const data = Buffer.concat(chunks);
      const c = gcm(bytes(key), bytes(iv), aad);
      if (encrypt) {
        const sealed = c.encrypt(data);
        tag = sealed.slice(sealed.length - 16);
        result = Buffer.from(sealed.slice(0, sealed.length - 16));
      } else {
        result = Buffer.from(c.decrypt(Buffer.concat([data, tag ?? Buffer.alloc(0)])));
      }
      return result;
    },
    getAuthTag() { return Buffer.from(tag); },
  };
}

export const createCipheriv = (alg, key, iv) => gcmStream(alg, key, iv, true);
export const createDecipheriv = (alg, key, iv) => gcmStream(alg, key, iv, false);
