import { describe, expect, it } from 'vitest';
import { LANGS } from '@chhetry/shared';
import { isSensitiveIntakeField } from '@chhetry/db';
import {
  DISCUSS_WITH_ATTORNEY, GOAL_OPTIONS, MODULES, answerSchema, formatAnswer, getQuestion, intakeModulesForGoal,
  missingRequired, moduleForGoal, moduleSchema, nextQuestion, validateAnswer,
} from '../src/index.js';

const allQuestions = Object.values(MODULES).flatMap((m) => m.questions);

describe('question definitions', () => {
  it('every question has a non-empty prompt in en, ne and bn', () => {
    for (const q of allQuestions) for (const lang of LANGS) expect(q.prompt[lang].trim(), `${q.module}.${q.id} ${lang}`).not.toBe('');
  });

  it('every enum option has a label in en, ne and bn', () => {
    for (const q of allQuestions.filter((x) => x.type === 'enum')) {
      expect(q.options?.length, `${q.module}.${q.id}`).toBeGreaterThan(0);
      for (const o of q.options!) for (const lang of LANGS) expect(o.label[lang].trim()).not.toBe('');
    }
  });

  it('question ids are unique within a module and match their module', () => {
    for (const m of Object.values(MODULES)) {
      const ids = m.questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of m.questions) expect(q.module).toBe(m.id);
    }
  });

  it('follow-ups point at questions that exist in the same module', () => {
    for (const m of Object.values(MODULES))
      for (const q of m.questions)
        for (const f of q.followUps ?? []) for (const id of f.ask) expect(getQuestion(m.id, id), `${m.id}.${id}`).toBeDefined();
  });

  it('fields that db encrypts are marked sensitive here (guardrail 8)', () => {
    for (const q of allQuestions) if (isSensitiveIntakeField(q.module, q.id)) expect(q.sensitive, `${q.module}.${q.id}`).toBe(true);
  });

  it('encrypted fields are sensitive', () => {
    for (const q of allQuestions.filter((x) => x.encrypted)) expect(q.sensitive).toBe(true);
  });

  it('builds a zod schema for every module', () => {
    for (const m of Object.values(MODULES)) expect(() => moduleSchema(m)).not.toThrow();
  });
});

describe('validateAnswer', () => {
  it('accepts typed values', () => {
    expect(validateAnswer('triage', 'detained', false)).toEqual({ ok: true, value: false });
    expect(validateAnswer('triage', 'hearing_date', { kind: 'date', value: '2026-12-01' }).ok).toBe(true);
    expect(validateAnswer('history', 'last_entry_manner', 'visa').ok).toBe(true);
    expect(validateAnswer('family', 'children_ages', [3, 19]).ok).toBe(true);
    expect(validateAnswer('core', 'citizenships', ['NP']).ok).toBe(true);
  });

  it('rejects wrong types, bad enum values, impossible dates and unknown fields', () => {
    expect(validateAnswer('triage', 'detained', 'yes').ok).toBe(false);
    expect(validateAnswer('history', 'last_entry_manner', 'boat').ok).toBe(false);
    expect(validateAnswer('triage', 'hearing_date', { kind: 'date', value: '2026-02-30' }).ok).toBe(false);
    expect(validateAnswer('triage', 'hearing_date', '2026-12-01').ok).toBe(false);
    expect(validateAnswer('core', 'favourite_colour', 'blue').ok).toBe(false);
    expect(validateAnswer('nope', 'x', 1).ok).toBe(false);
  });

  it('accepts "discuss with attorney" only where allowed', () => {
    expect(validateAnswer('history', 'prior_court_or_removal', DISCUSS_WITH_ATTORNEY).ok).toBe(true);
    expect(validateAnswer('core', 'full_name', DISCUSS_WITH_ATTORNEY).ok).toBe(false);
  });

  it('sensitive questions that touch criminal or removal history allow "discuss with attorney"', () => {
    for (const id of ['prior_court_or_removal', 'current_status', 'denials', 'overstay_length']) {
      expect(getQuestion('history', id)?.allowDiscussWithAttorney).toBe(true);
    }
  });

  it('answerSchema rejects blank text', () => {
    expect(answerSchema(getQuestion('core', 'full_name')!).safeParse('   ').success).toBe(false);
  });
});

describe('flow helpers', () => {
  it('maps goals to their module', () => {
    expect(moduleForGoal('family')).toBe('family');
    expect(moduleForGoal('removal_defense')).toBe('removal');
    expect(moduleForGoal('employment')).toBeNull();
    expect(intakeModulesForGoal('family')).toEqual(['core', 'history', 'family']);
    expect(intakeModulesForGoal('other')).toEqual(['core', 'history']);
    expect(GOAL_OPTIONS.map((g) => g.value)).toContain('removal_defense');
  });

  it('nextQuestion walks the module in order and skips inactive follow-ups', () => {
    expect(nextQuestion('triage', {})?.id).toBe('detained');
    const a = { detained: false, hearing_date: null, has_nta_or_removal_order: 'none', ice_contact: false, upcoming_deadline: false } as const;
    expect(nextQuestion('triage', a)?.id).toBe('stuck_abroad');
    const b = { ...a, upcoming_deadline: true };
    expect(nextQuestion('triage', b)?.id).toBe('upcoming_deadline_type');
  });

  it('nextQuestion honours skipped fields and returns null when done', () => {
    const answers = Object.fromEntries(MODULES.removal.questions.map((q) => [q.id, null]));
    expect(nextQuestion('removal', answers)).toBeNull();
    expect(nextQuestion('core', { full_name: 'X' }, ['other_names'])?.id).toBe('phone');
  });

  it('missingRequired lists required active fields only', () => {
    expect(missingRequired('core', { case_for: 'self' })).not.toContain('relationship');
    expect(missingRequired('core', { case_for: 'self' })).toContain('full_name');
  });

  it('formatAnswer masks encrypted fields and localizes booleans and enums', () => {
    const aq = getQuestion('history', 'a_number')!;
    expect(formatAnswer(aq, 'A200000101', 'en')).toBe('••••101');
    expect(formatAnswer(getQuestion('triage', 'detained')!, true, 'ne')).toBe('हो');
    expect(formatAnswer(getQuestion('history', 'last_entry_manner')!, 'visa', 'bn')).toBe('ভিসা নিয়ে');
    expect(formatAnswer(getQuestion('history', 'denials')!, DISCUSS_WITH_ATTORNEY, 'en')).toBe('Discuss with attorney');
  });
});
