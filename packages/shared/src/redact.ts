/**
 * PII redaction for logs and analytics (CLAUDE.md guardrail 8, section 13).
 * Two layers: redact by field name (any depth), and redact by pattern inside
 * every string value, including log messages and error messages.
 */

export const REDACTED = '[REDACTED]';

/** Keys are normalized (lowercase, alphanumerics only) before matching. */
const SENSITIVE_KEYS = new Set([
  'anumber', 'aliennumber', 'uscisnumber',
  'ssn', 'socialsecuritynumber', 'itin',
  'fullname', 'othernames', 'firstname', 'lastname', 'middlename', 'name', 'displayname',
  'phone', 'phonenumber', 'mobile', 'email', 'emailaddress',
  'address', 'street', 'streetaddress', 'postalcode', 'zip', 'zipcode',
  'dob', 'dateofbirth', 'birthdate',
  'passport', 'passportnumber', 'i94', 'i94number',
  'immigrationstatus', 'currentstatus', 'statusexpiry',
  'arrestschargesconvictions', 'criminalhistory', 'falsedocuments', 'misrepresentation',
  'fearofreturn', 'harmsource', 'persecution', 'persecutiondetails',
  'transcript', 'transcriptref', 'transcripttext', 'audio',
  'password', 'otp', 'pin', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie', 'apikey', 'secret',
].map((k) => k.toLowerCase()));

/** Substrings that mark a key as sensitive wherever they appear. */
const SENSITIVE_KEY_PARTS = ['password', 'secret', 'token', 'anumber', 'ssn', 'criminal', 'persecution', 'transcript', 'apikey'];

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  return SENSITIVE_KEYS.has(k) || SENSITIVE_KEY_PARTS.some((p) => k.includes(p));
}

/** Ordered: more specific patterns first. Each is global. */
const PATTERNS: { name: string; re: RegExp }[] = [
  // Field ciphertext from @chhetry/db. Not secret on its own, but there is no reason to log it.
  { name: 'ciphertext', re: /enc:v\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g },
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // USCIS receipt numbers: 3 letters + 10 digits (e.g. IOE0912345678, MSC2190123456).
  { name: 'receipt', re: /\b(?:IOE|MSC|EAC|WAC|LIN|SRC|NBC|YSC|TSC|VSC|NSC|CSC)\d{10}\b/gi },
  // A-numbers: A followed by 8 or 9 digits, with optional dashes or spaces (A123456789, A-123-456-789).
  { name: 'a_number', re: /\bA[-\s]?\d{2,3}[-\s]?\d{3}[-\s]?\d{3}\b/gi },
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'card', re: /\b(?:\d[ -]?){13,16}\b/g },
  // Phone numbers: US and international (+977, +880) shapes with 9+ digits.
  { name: 'phone', re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{0,4}\b/g },
];

function countDigits(s: string): number {
  let n = 0;
  for (const c of s) if (c >= '0' && c <= '9') n++;
  return n;
}

export function redactString(input: string): string {
  let out = input;
  for (const { name, re } of PATTERNS) {
    out = out.replace(re, (m) => {
      if (name === 'phone' && countDigits(m) < 9) return m; // leave dates, counts, short ids
      return `[REDACTED:${name}]`;
    });
  }
  return out;
}

const MAX_DEPTH = 8;

/** Returns a redacted deep copy. Never mutates the input. Safe on cycles. */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet(), depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, seen, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? (v === undefined || v === null ? v : REDACTED) : redact(v, seen, depth + 1);
  }
  return out;
}
