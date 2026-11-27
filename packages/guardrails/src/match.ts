/**
 * Token matching shared by the classifier and output checker.
 *
 * - Text is NFC-normalized and lowercased.
 * - ASCII tokens match on word boundaries, so 'ice' does not match 'notice'
 *   or 'advice'. A trailing '*' makes the token a prefix: 'deport*' matches
 *   'deported' and 'deportation'.
 * - Non-ASCII tokens (Devanagari, Bengali) match as substrings, because JS
 *   word boundaries are ASCII-only and both scripts attach suffixes.
 */

export function normalize(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
}

const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cache = new Map<string, RegExp>();

function asciiRegex(token: string): RegExp {
  let re = cache.get(token);
  if (!re) {
    const prefix = token.endsWith('*');
    const body = escape(prefix ? token.slice(0, -1) : token);
    re = new RegExp(`(?<![a-z0-9])${body}${prefix ? '' : '(?![a-z0-9])'}`, 'i');
    cache.set(token, re);
  }
  return re;
}

/** Returns the index of the first match, or -1. `normalized` must come from normalize(). */
export function findToken(normalized: string, token: string): number {
  const t = normalize(token);
  if (isAscii(t)) {
    const m = asciiRegex(t).exec(normalized);
    return m ? m.index : -1;
  }
  return normalized.indexOf(t.endsWith('*') ? t.slice(0, -1) : t);
}

export function hasToken(normalized: string, token: string): boolean {
  return findToken(normalized, token) >= 0;
}

/** True when, for every group, at least one token in the group appears. */
export function matchesAllOf(normalized: string, allOf: readonly (readonly string[])[]): string[] | null {
  const hits: string[] = [];
  for (const group of allOf) {
    const hit = group.find((tok) => hasToken(normalized, tok));
    if (!hit) return null;
    hits.push(hit);
  }
  return hits;
}
