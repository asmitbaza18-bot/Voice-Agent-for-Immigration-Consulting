import { describe, expect, it } from 'vitest';
import type { Lang, UrgentFlag } from '@chhetry/shared';
import { factsNotAdviceLabel, t } from '@chhetry/i18n';
import {
  checkEscalation, checkOutput, classifyKeywords, classifyQuestion, enforceOutput, extractDates, hasToken, normalize,
  type InputLabel,
} from '../src/index.js';
import urgent from './fixtures/urgent.json' with { type: 'json' };
import labeled from './fixtures/classifier.json' with { type: 'json' };
import redteam from './fixtures/redteam-outputs.json' with { type: 'json' };

describe('token matching', () => {
  it('uses word boundaries for ASCII so ICE does not match notice or advice', () => {
    expect(hasToken(normalize('I got a notice'), 'ice')).toBe(false);
    expect(hasToken(normalize('legal advice please'), 'ice')).toBe(false);
    expect(hasToken(normalize('ICE came'), 'ice')).toBe(true);
    expect(hasToken(normalize('He was deported'), 'deport*')).toBe(true);
    expect(hasToken(normalize('can it wait'), 'can i')).toBe(false);
  });
});

describe('escalation checker: urgent fixtures (target 100%)', () => {
  for (const c of urgent.cases) {
    it(`[${c.lang}] ${c.text}`, () => {
      const r = checkEscalation(c.text);
      expect(r.urgent).toBe(true);
      for (const f of c.flags) expect(r.flags).toContain(f as UrgentFlag);
    });
  }

  it('covers every language', () => {
    for (const lang of ['en', 'ne', 'bn']) expect(urgent.cases.filter((c) => c.lang === lang).length).toBeGreaterThanOrEqual(5);
  });

  it('does not escalate routine case questions', () => {
    for (const s of ['When is my interview?', 'What documents are missing?', 'मेरो कागजात के बाँकी छ?', 'আমার কোন কাগজ বাকি?']) expect(checkEscalation(s).urgent).toBe(false);
  });
});

describe('input classifier: labeled set', () => {
  for (const c of labeled.cases) {
    it(`[${c.lang}] ${c.text} -> ${c.label}`, () => {
      const r = classifyKeywords(c.text);
      expect(r.label).toBe(c.label);
      if ('reason' in c && c.reason) expect(r.reasons).toContain(c.reason);
    });
  }

  it('records pattern ids, never the text', () => {
    const r = classifyKeywords('Am I eligible? My A-number is A200000101');
    expect(JSON.stringify(r)).not.toContain('A200000101');
    expect(r.matchedPatterns).toContain('en.eligibility');
  });
});

describe('classifyQuestion with an LLM labeler', () => {
  const llm = (label: InputLabel) => async () => label;

  it('lets the LLM raise severity', async () => {
    expect((await classifyQuestion('When is my hearing?', llm('legal_question'))).label).toBe('legal_question');
  });

  it('never lets the LLM downgrade a keyword hit', async () => {
    expect((await classifyQuestion('Can I travel to Nepal?', llm('fact'))).label).toBe('legal_question');
    expect((await classifyQuestion('ICE is at my door', llm('off_topic'))).label).toBe('urgent');
  });

  it('lets the LLM choose among low-risk labels', async () => {
    expect((await classifyQuestion('hello there', llm('off_topic'))).label).toBe('off_topic');
  });

  it('falls back to keywords if the LLM throws or returns junk', async () => {
    const r = await classifyQuestion('Am I eligible?', async () => { throw new Error('down'); });
    expect(r.label).toBe('legal_question');
    expect((await classifyQuestion('When is my hearing?', async () => 'banana' as InputLabel)).label).toBe('fact');
  });
});

describe('output checker: red-team set (target: zero pass)', () => {
  for (const c of redteam.mustBlock) {
    it(`blocks [${c.lang}] ${c.text}`, () => {
      const lang = c.lang as Lang;
      const withLabel = `${c.text}\n\n${factsNotAdviceLabel(lang)}`;
      const r = checkOutput(withLabel, lang);
      expect(r.ok).toBe(false);
      expect(r.violations.map((v) => v.code)).toContain(c.code);
      expect(enforceOutput(withLabel, lang).blocked).toBe(true);
    });
  }

  for (const c of redteam.mustPass) {
    it(`passes [${c.lang}] ${c.text}`, () => {
      const lang = c.lang as Lang;
      const r = checkOutput(`${c.text}\n\n${factsNotAdviceLabel(lang)}`, lang);
      expect(r.violations).toEqual([]);
    });
  }
});

describe('enforceOutput', () => {
  it('appends the localized label when missing (guardrail 7)', () => {
    for (const lang of ['en', 'ne', 'bn'] as Lang[]) {
      const r = enforceOutput('Your interview is on 2027-01-08.', lang);
      expect(r.blocked).toBe(false);
      expect(r.text.endsWith(factsNotAdviceLabel(lang))).toBe(true);
      expect(r.violations.map((v) => v.code)).toEqual(['missing_label']);
    }
  });

  it('replaces a blocked answer with the safe handoff message, with the label', () => {
    const r = enforceOutput('You will win.', 'ne');
    expect(r.blocked).toBe(true);
    expect(r.text).toContain(t('ne', 'agent.answer_blocked'));
    expect(r.text).toContain(factsNotAdviceLabel('ne'));
    expect(r.text).not.toContain('You will win');
  });

  it('blocks dates that are not in the facts', () => {
    const allowed = ['2027-01-08'];
    expect(enforceOutput('Your interview is on 2027-01-08.', 'en', { allowedDates: allowed }).blocked).toBe(false);
    expect(enforceOutput('Your interview is on January 8, 2027.', 'en', { allowedDates: allowed }).blocked).toBe(false);
    expect(enforceOutput('Your interview is on 2027-01-09.', 'en', { allowedDates: allowed }).blocked).toBe(true);
  });

  it('extracts ISO and long-form English dates', () => {
    expect(extractDates('on 2027-02-18 and February 3, 2027')).toEqual(['2027-02-18', '2027-02-03']);
  });
});
