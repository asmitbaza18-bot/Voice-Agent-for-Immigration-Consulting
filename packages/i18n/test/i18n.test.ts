import { describe, expect, it } from 'vitest';
import { LANGS } from '@chhetry/shared';
import { CATALOGS, DISCLOSURE_KEYS, disclosures, factsNotAdviceLabel, needsNativeReview, t, TRANSLATION_STATUS } from '../src/index.js';

const DEVANAGARI = /[ऀ-ॿ]/;
const BENGALI = /[ঀ-৿]/;

describe('catalog parity', () => {
  const enKeys = Object.keys(CATALOGS.en).sort();
  it.each(LANGS)('%s has exactly the en keys, all non-empty', (lang) => {
    expect(Object.keys(CATALOGS[lang]).sort()).toEqual(enKeys);
    for (const v of Object.values(CATALOGS[lang])) expect(v.trim()).not.toBe('');
  });

  it('ne strings are Devanagari and bn strings are Bengali script', () => {
    for (const v of Object.values(CATALOGS.ne)) expect(v).toMatch(DEVANAGARI);
    for (const v of Object.values(CATALOGS.bn)) expect(v).toMatch(BENGALI);
  });

  it('ne and bn are not copies of en', () => {
    for (const k of Object.keys(CATALOGS.en) as (keyof typeof CATALOGS.en)[]) {
      expect(CATALOGS.ne[k]).not.toBe(CATALOGS.en[k]);
      expect(CATALOGS.bn[k]).not.toBe(CATALOGS.en[k]);
    }
  });
});

describe('disclosures (guardrail 6)', () => {
  it.each(LANGS)('%s covers AI disclosure, recording consent, not-advice and confidentiality in order', (lang) => {
    const d = disclosures(lang);
    expect(d.map((x) => x.key)).toEqual([...DISCLOSURE_KEYS]);
    expect(d.every((x) => x.text.length > 0)).toBe(true);
  });

  it('English disclosure says it is an AI and that it is not legal advice', () => {
    expect(t('en', 'disclosure.ai')).toMatch(/\bAI\b/);
    expect(t('en', 'disclosure.info_not_advice')).toMatch(/not legal advice/);
    expect(t('en', 'disclosure.info_not_advice')).toMatch(/attorney will review/);
  });
});

describe('answer label (guardrail 7)', () => {
  it('matches the spec wording in English', () => {
    expect(factsNotAdviceLabel('en')).toBe('Facts from your file only, not legal advice');
  });
  it.each(LANGS)('exists for %s', (lang) => {
    expect(factsNotAdviceLabel(lang).length).toBeGreaterThan(5);
  });
});

describe('translation review status', () => {
  it('flags Nepali and Bengali as machine drafts until a native speaker signs off', () => {
    expect(TRANSLATION_STATUS.en).toBe('source');
    expect(needsNativeReview('ne')).toBe(true);
    expect(needsNativeReview('bn')).toBe(true);
  });
});
