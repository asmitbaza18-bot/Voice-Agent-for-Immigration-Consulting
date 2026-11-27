import type { RuleHit, RuleInput } from '../src/index.js';

/**
 * Fixtures per rule. Each rule needs at least one case that fires and one
 * that does not (enforced in rules.test.ts). The attorney can read these as
 * worked examples when verifying a rule.
 */
export interface RuleFixture {
  name: string;
  today?: string; // default 2026-11-27
  input: RuleInput;
  expect: RuleHit[];
}

const d = (value: string) => ({ kind: 'date' as const, value });
const DISCUSS = { kind: 'discuss_with_attorney' as const };

export const FIXTURES: Record<string, RuleFixture[]> = {
  'triage.urgent_flags': [
    { name: 'nothing urgent', input: { modules: { triage: { detained: false, ice_contact: false, stuck_abroad: false, in_danger: false, has_nta_or_removal_order: 'nta', hearing_date: d('2027-03-01') } } }, expect: [] },
    { name: 'detained', input: { modules: { triage: { detained: true } } }, expect: [{ kind: 'urgentFlag', flag: 'detained', note: 'Person is in immigration detention.' }] },
    { name: 'hearing exactly 7 days out', input: { modules: { triage: { hearing_date: d('2026-12-04') } } }, expect: [{ kind: 'urgentFlag', flag: 'hearing_within_7_days', note: 'Hearing on 2026-12-04, in 7 day(s).' }] },
    { name: 'hearing 8 days out is not urgent', input: { modules: { triage: { hearing_date: d('2026-12-05') } } }, expect: [] },
    { name: 'hearing in the past (possible missed hearing)', input: { modules: { triage: { hearing_date: d('2026-11-20') } } }, expect: [{ kind: 'urgentFlag', flag: 'hearing_within_7_days', note: 'Hearing date 2026-11-20 is in the past; possible missed hearing.' }] },
    { name: 'removal module hearing counts too', input: { modules: { removal: { hearing_date: d('2026-11-28') } } }, expect: [{ kind: 'urgentFlag', flag: 'hearing_within_7_days', note: 'Hearing on 2026-11-28, in 1 day(s).' }] },
    { name: 'removal order', input: { modules: { triage: { has_nta_or_removal_order: 'removal_order' } } }, expect: [{ kind: 'urgentFlag', flag: 'removal_order', note: 'Caller reports a removal order.' }] },
    { name: 'ice contact', input: { modules: { triage: { ice_contact: true } } }, expect: [{ kind: 'urgentFlag', flag: 'ice_contact', note: 'Caller reports ICE contact.' }] },
    { name: 'deadline in 14 days', input: { modules: { triage: { upcoming_deadline: true, upcoming_deadline_date: d('2026-12-11') } } }, expect: [{ kind: 'urgentFlag', flag: 'deadline_within_14_days', note: 'Deadline on 2026-12-11, in 14 day(s).' }] },
    { name: 'deadline in 15 days is not urgent', input: { modules: { triage: { upcoming_deadline_date: d('2026-12-12') } } }, expect: [] },
    { name: 'stuck abroad', input: { modules: { triage: { stuck_abroad: true } } }, expect: [{ kind: 'urgentFlag', flag: 'stuck_abroad', note: 'Person is outside the US and cannot return.' }] },
    { name: 'danger', input: { modules: { triage: { in_danger: true } } }, expect: [{ kind: 'urgentFlag', flag: 'danger', note: 'Caller reports danger.' }] },
  ],
  'entry.inspected': [
    { name: 'visa', input: { modules: { history: { last_entry_manner: 'visa' } } }, expect: [{ kind: 'pathwayHint', code: 'inspected_admitted_or_paroled', label: 'Last entry was inspected and admitted or paroled', dependsOn: ['history.last_entry_manner'] }] },
    { name: 'parole', input: { modules: { history: { last_entry_manner: 'parole' } } }, expect: [{ kind: 'pathwayHint', code: 'inspected_admitted_or_paroled', label: 'Last entry was inspected and admitted or paroled', dependsOn: ['history.last_entry_manner'] }] },
    { name: 'ewi', input: { modules: { history: { last_entry_manner: 'ewi' } } }, expect: [{ kind: 'redFlag', code: 'entry.ewi', note: 'Last entry without inspection. Attorney to check 245(a) eligibility and exceptions such as 245(i).' }] },
    { name: 'unsure gives nothing', input: { modules: { history: { last_entry_manner: 'unsure' } } }, expect: [] },
  ],
  'bar.unlawful_presence_3y': [
    { name: 'overstay 6-12 months then left', input: { modules: { history: { overstay_length: '180_days_to_1_year', departed_after_overstay: true } } }, expect: [{ kind: 'redFlag', code: 'bar.unlawful_presence_3y', note: 'Possible 3-year unlawful presence bar: 180 days to 1 year of overstay, then departure.' }] },
    { name: 'overstay but never left', input: { modules: { history: { overstay_length: '180_days_to_1_year', departed_after_overstay: false } } }, expect: [] },
    { name: 'short overstay then left', input: { modules: { history: { overstay_length: 'under_180_days', departed_after_overstay: true } } }, expect: [] },
  ],
  'bar.unlawful_presence_10y': [
    { name: 'overstay 1y+ then left', input: { modules: { history: { overstay_length: 'over_1_year', departed_after_overstay: true } } }, expect: [{ kind: 'redFlag', code: 'bar.unlawful_presence_10y', note: 'Possible 10-year unlawful presence bar: 1 year or more of overstay, then departure.' }] },
    { name: 'overstay 1y+ still here', input: { modules: { history: { overstay_length: 'over_1_year' } } }, expect: [] },
  ],
  'bar.permanent': [
    { name: 'long overstay then EWI re-entry', input: { modules: { history: { overstay_length: 'over_1_year', reentry_without_inspection: true } } }, expect: [{ kind: 'redFlag', code: 'bar.permanent', note: 'Possible permanent bar: over 1 year unlawful presence or prior removal, then entry or attempted entry without inspection.' }] },
    { name: 'deported then EWI re-entry', input: { modules: { history: { prior_court_or_removal: 'deported', reentry_without_inspection: true } } }, expect: [{ kind: 'redFlag', code: 'bar.permanent', note: 'Possible permanent bar: over 1 year unlawful presence or prior removal, then entry or attempted entry without inspection.' }] },
    { name: 'long overstay, no re-entry', input: { modules: { history: { overstay_length: 'over_1_year', reentry_without_inspection: false } } }, expect: [] },
  ],
  'asylum.one_year': [
    { name: 'arrived 3 months ago', input: { goal: 'humanitarian', modules: { humanitarian: { us_arrival_date: d('2026-08-27') } } }, expect: [{ kind: 'deadline', label: 'Asylum one-year filing deadline (attorney to check exceptions)', date: '2027-08-27' }] },
    { name: 'deadline passed', input: { modules: { humanitarian: { fear_of_return: true, us_arrival_date: d('2025-01-10') } } }, expect: [
      { kind: 'deadline', label: 'Asylum one-year filing deadline (attorney to check exceptions)', date: '2026-01-10' },
      { kind: 'redFlag', code: 'asylum.one_year_passed', note: 'One-year asylum deadline (2026-01-10) has passed. Attorney to check changed or extraordinary circumstances.' },
    ] },
    { name: 'leap day arrival rolls back to Feb 28', input: { goal: 'humanitarian', modules: { humanitarian: { us_arrival_date: d('2028-02-29') } } }, expect: [{ kind: 'deadline', label: 'Asylum one-year filing deadline (attorney to check exceptions)', date: '2029-02-28' }] },
    { name: 'not a humanitarian case', input: { goal: 'family', modules: { humanitarian: { us_arrival_date: d('2026-08-27') } } }, expect: [] },
  ],
  'cspa.age_out': [
    { name: 'child aged 19', input: { modules: { family: { children_ages: [4, 19] } } }, expect: [{ kind: 'redFlag', code: 'cspa.age_out_risk', note: 'Child age(s) 19 near 21. Attorney to compute CSPA age.' }] },
    { name: 'children under 18 and over 21', input: { modules: { family: { children_ages: [17, 21] } } }, expect: [] },
  ],
  'n400.residence': [
    { name: 'LPR 5 years ago', input: { modules: { naturalization: { lpr_since: d('2021-06-01') } } }, expect: [
      { kind: 'deadline', label: 'Continuous residence date (5 years)', date: '2026-06-01' },
      { kind: 'pathwayHint', code: 'naturalization', label: 'Residence period for naturalization appears met', dependsOn: ['naturalization.lpr_since', 'naturalization.married_to_usc_years'] },
    ] },
    { name: 'married to USC 3 years, LPR 2 years ago', input: { modules: { naturalization: { lpr_since: d('2024-11-27'), married_to_usc_years: 3 } } }, expect: [{ kind: 'deadline', label: 'Continuous residence date (3 years, married to US citizen)', date: '2027-11-27' }] },
    { name: 'no LPR date', input: { modules: {} }, expect: [] },
  ],
  'n400.early_filing': [
    { name: '90 days before 5-year date', input: { modules: { naturalization: { lpr_since: d('2022-03-01') } } }, expect: [{ kind: 'deadline', label: 'Earliest N-400 filing date (90-day early window)', date: '2026-12-01' }] },
    { name: 'no LPR date', input: { modules: {} }, expect: [] },
  ],
  'deadline.rfe': [
    { name: 'RFE with 87-day response period', input: { modules: {}, notices: [{ kind: 'rfe', noticeDate: '2026-10-16', responseDays: 87 }] }, expect: [{ kind: 'deadline', label: 'RFE response due (confirm against the notice)', date: '2027-01-11' }] },
    { name: 'no notices', input: { modules: {} }, expect: [] },
  ],
  'flag.criminal': [
    { name: 'reported arrest', input: { modules: { red_flags: { arrests_charges_convictions: ['2019 NY arrest, dismissed'] } } }, expect: [{ kind: 'redFlag', code: 'flag.criminal', note: 'Caller reported an arrest, charge or conviction. Attorney review required.' }] },
    { name: 'prefers attorney', input: { modules: { red_flags: { arrests_charges_convictions: DISCUSS } } }, expect: [{ kind: 'redFlag', code: 'flag.criminal', note: 'Caller chose to discuss arrests or convictions with the attorney.' }] },
    { name: 'explicit no', input: { modules: { red_flags: { arrests_charges_convictions: false } } }, expect: [] },
    { name: 'empty list', input: { modules: { red_flags: { arrests_charges_convictions: [] } } }, expect: [] },
  ],
  'flag.prior_removal': [
    { name: 'removal order', input: { modules: { history: { prior_court_or_removal: 'removal_order' } } }, expect: [{ kind: 'redFlag', code: 'flag.prior_removal', note: 'Prior court or removal history reported (removal_order).' }] },
    { name: 'unsure still flags', input: { modules: { history: { prior_court_or_removal: 'unsure' } } }, expect: [{ kind: 'redFlag', code: 'flag.prior_removal', note: 'Prior court or removal history reported (unsure).' }] },
    { name: 'prefers attorney', input: { modules: { history: { prior_court_or_removal: DISCUSS } } }, expect: [{ kind: 'redFlag', code: 'flag.prior_removal', note: 'Caller chose to discuss prior court or removal history with the attorney.' }] },
    { name: 'none', input: { modules: { history: { prior_court_or_removal: 'none' } } }, expect: [] },
  ],
};
