import { describe, expect, it } from 'vitest';
import { addDays, addYears, computeUrgentFlags, daysBetween, EVALUATORS, RULES, RULES_VERSION, runRules } from '../src/index.js';
import { FIXTURES } from './fixtures.js';

const TODAY = '2026-11-27';

describe('rule file', () => {
  it('has a version that is stamped on output', () => {
    expect(RULES_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\./);
    expect(runRules({ modules: {} }, { today: TODAY }).rulesVersion).toBe(RULES_VERSION);
  });

  it('includes every starter rule from CLAUDE.md section 8', () => {
    const ids = RULES.map((r) => r.id);
    for (const id of ['entry.inspected', 'bar.unlawful_presence_3y', 'bar.unlawful_presence_10y', 'bar.permanent', 'asylum.one_year', 'cspa.age_out', 'n400.residence', 'n400.early_filing', 'deadline.rfe', 'flag.criminal', 'flag.prior_removal'])
      expect(ids).toContain(id);
  });

  it('every rule is unverified until the attorney signs off (Milestone 4)', () => {
    for (const r of RULES) expect(r.verified, r.id).toBe(false);
    expect(runRules({ modules: {} }, { today: TODAY }).unverifiedRuleIds).toHaveLength(RULES.length);
  });

  it('every rule has a citation, an owner and an evaluator', () => {
    for (const r of RULES) {
      expect(r.citation).not.toBe('');
      expect(r.owner).not.toBe('');
      expect(EVALUATORS[r.id]).toBeTypeOf('function');
    }
  });

  it('every rule has a firing and a non-firing fixture', () => {
    for (const r of RULES) {
      const fx = FIXTURES[r.id];
      expect(fx, `fixtures for ${r.id}`).toBeDefined();
      expect(fx!.some((f) => f.expect.length > 0), `${r.id} firing case`).toBe(true);
      expect(fx!.some((f) => f.expect.length === 0), `${r.id} non-firing case`).toBe(true);
    }
  });
});

for (const [ruleId, fixtures] of Object.entries(FIXTURES)) {
  describe(`rule ${ruleId}`, () => {
    for (const f of fixtures) {
      it(f.name, () => {
        expect(EVALUATORS[ruleId]!(f.input, { today: f.today ?? TODAY })).toEqual(f.expect);
      });
    }
  });
}

describe('runRules', () => {
  it('aggregates outputs with rule ids and sorts deadlines', () => {
    const out = runRules(
      {
        goal: 'humanitarian',
        modules: {
          history: { last_entry_manner: 'ewi', prior_court_or_removal: 'removal_order' },
          humanitarian: { us_arrival_date: { kind: 'date', value: '2026-08-27' } },
        },
        notices: [{ kind: 'rfe', noticeDate: '2026-10-16', responseDays: 87 }],
      },
      { today: TODAY },
    );
    expect(out.redFlags.map((r) => r.ruleId)).toEqual(['entry.inspected', 'flag.prior_removal']);
    expect(out.deadlines.map((d) => d.date)).toEqual(['2027-01-11', '2027-08-27']);
    expect(out.urgentFlags).toEqual([]);
  });

  it('is deterministic for the same input and date', () => {
    const input = { modules: { triage: { detained: true } } };
    expect(runRules(input, { today: TODAY })).toEqual(runRules(input, { today: TODAY }));
  });

  it('computeUrgentFlags dedupes flags', () => {
    expect(computeUrgentFlags({ modules: { triage: { detained: true, ice_contact: true } } }, { today: TODAY })).toEqual(['detained', 'ice_contact']);
  });
});

describe('dates', () => {
  it('adds days and years in UTC', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(daysBetween('2026-11-27', '2026-12-04')).toBe(7);
    expect(() => addDays('2026-13-01', 1)).toThrow();
  });
});
