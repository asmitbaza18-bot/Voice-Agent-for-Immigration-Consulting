import type { UrgentFlag } from '@chhetry/shared';
import { addDays, addYears, daysBetween } from './dates.js';
import { Facts } from './facts.js';
import type { Evaluator, RuleHit } from './types.js';

/**
 * One small, pure evaluator per rule id. Rule metadata (description, citation,
 * verified) lives in rules/starter-rules.json; this file holds only the logic.
 * ATTORNEY MUST VERIFY each one; see the JSON for the plain-English logic.
 */

const HEARING_URGENT_DAYS = 7;
const DEADLINE_URGENT_DAYS = 14;

const urgent = (flag: UrgentFlag, note: string): RuleHit => ({ kind: 'urgentFlag', flag, note });

const triageUrgentFlags: Evaluator = (input, { today }) => {
  const f = new Facts(input);
  const hits: RuleHit[] = [];
  if (f.bool('triage', 'detained')) hits.push(urgent('detained', 'Person is in immigration detention.'));

  const hearings = [f.date('triage', 'hearing_date'), f.date('removal', 'hearing_date')].filter((d): d is string => !!d);
  for (const h of hearings) {
    const days = daysBetween(today, h);
    if (days <= HEARING_URGENT_DAYS) {
      hits.push(urgent('hearing_within_7_days', days < 0 ? `Hearing date ${h} is in the past; possible missed hearing.` : `Hearing on ${h}, in ${days} day(s).`));
      break;
    }
  }
  if (f.str('triage', 'has_nta_or_removal_order') === 'removal_order') hits.push(urgent('removal_order', 'Caller reports a removal order.'));
  if (f.bool('triage', 'ice_contact')) hits.push(urgent('ice_contact', 'Caller reports ICE contact.'));

  const deadline = f.date('triage', 'upcoming_deadline_date');
  if (deadline) {
    const days = daysBetween(today, deadline);
    if (days <= DEADLINE_URGENT_DAYS)
      hits.push(urgent('deadline_within_14_days', days < 0 ? `Deadline ${deadline} has passed.` : `Deadline on ${deadline}, in ${days} day(s).`));
  }
  if (f.bool('triage', 'stuck_abroad')) hits.push(urgent('stuck_abroad', 'Person is outside the US and cannot return.'));
  if (f.bool('triage', 'in_danger')) hits.push(urgent('danger', 'Caller reports danger.'));
  return hits;
};

const entryInspected: Evaluator = (input) => {
  const m = new Facts(input).str('history', 'last_entry_manner');
  if (m === 'visa' || m === 'vwp' || m === 'parole')
    return [{ kind: 'pathwayHint', code: 'inspected_admitted_or_paroled', label: 'Last entry was inspected and admitted or paroled', dependsOn: ['history.last_entry_manner'] }];
  if (m === 'ewi')
    return [{ kind: 'redFlag', code: 'entry.ewi', note: 'Last entry without inspection. Attorney to check 245(a) eligibility and exceptions such as 245(i).' }];
  return [];
};

const bar3y: Evaluator = (input) => {
  const f = new Facts(input);
  return f.str('history', 'overstay_length') === '180_days_to_1_year' && f.bool('history', 'departed_after_overstay') === true
    ? [{ kind: 'redFlag', code: 'bar.unlawful_presence_3y', note: 'Possible 3-year unlawful presence bar: 180 days to 1 year of overstay, then departure.' }]
    : [];
};

const bar10y: Evaluator = (input) => {
  const f = new Facts(input);
  return f.str('history', 'overstay_length') === 'over_1_year' && f.bool('history', 'departed_after_overstay') === true
    ? [{ kind: 'redFlag', code: 'bar.unlawful_presence_10y', note: 'Possible 10-year unlawful presence bar: 1 year or more of overstay, then departure.' }]
    : [];
};

const barPermanent: Evaluator = (input) => {
  const f = new Facts(input);
  const longOverstay = f.str('history', 'overstay_length') === 'over_1_year';
  const prior = f.str('history', 'prior_court_or_removal');
  const priorRemoval = prior === 'removal_order' || prior === 'deported';
  return (longOverstay || priorRemoval) && f.bool('history', 'reentry_without_inspection') === true
    ? [{ kind: 'redFlag', code: 'bar.permanent', note: 'Possible permanent bar: over 1 year unlawful presence or prior removal, then entry or attempted entry without inspection.' }]
    : [];
};

const asylumOneYear: Evaluator = (input, { today }) => {
  const f = new Facts(input);
  const relevant = f.goal === 'humanitarian' || f.bool('humanitarian', 'fear_of_return') === true;
  const arrival = f.date('humanitarian', 'us_arrival_date');
  if (!relevant || !arrival) return [];
  const due = addYears(arrival, 1);
  const hits: RuleHit[] = [{ kind: 'deadline', label: 'Asylum one-year filing deadline (attorney to check exceptions)', date: due }];
  if (daysBetween(today, due) < 0)
    hits.push({ kind: 'redFlag', code: 'asylum.one_year_passed', note: `One-year asylum deadline (${due}) has passed. Attorney to check changed or extraordinary circumstances.` });
  return hits;
};

const cspaAgeOut: Evaluator = (input) => {
  const ages = new Facts(input).numbers('family', 'children_ages').filter((a) => a >= 18 && a < 21);
  return ages.length
    ? [{ kind: 'redFlag', code: 'cspa.age_out_risk', note: `Child age(s) ${ages.join(', ')} near 21. Attorney to compute CSPA age.` }]
    : [];
};

function residenceDate(f: Facts): { date: string; basis: '3y_marriage' | '5y' } | null {
  const lpr = f.date('naturalization', 'lpr_since');
  if (!lpr) return null;
  const married = (f.num('naturalization', 'married_to_usc_years') ?? 0) >= 3;
  return married ? { date: addYears(lpr, 3), basis: '3y_marriage' } : { date: addYears(lpr, 5), basis: '5y' };
}

const n400Residence: Evaluator = (input, { today }) => {
  const r = residenceDate(new Facts(input));
  if (!r) return [];
  const hits: RuleHit[] = [
    { kind: 'deadline', label: `Continuous residence date (${r.basis === '3y_marriage' ? '3 years, married to US citizen' : '5 years'})`, date: r.date },
  ];
  if (daysBetween(r.date, today) >= 0)
    hits.push({ kind: 'pathwayHint', code: 'naturalization', label: 'Residence period for naturalization appears met', dependsOn: ['naturalization.lpr_since', 'naturalization.married_to_usc_years'] });
  return hits;
};

const n400EarlyFiling: Evaluator = (input) => {
  const r = residenceDate(new Facts(input));
  return r ? [{ kind: 'deadline', label: 'Earliest N-400 filing date (90-day early window)', date: addDays(r.date, -90) }] : [];
};

const deadlineRfe: Evaluator = (input) =>
  new Facts(input).notices
    .filter((n) => n.kind === 'rfe')
    .map((n) => ({ kind: 'deadline', label: n.label ?? 'RFE response due (confirm against the notice)', date: addDays(n.noticeDate, n.responseDays) }) as RuleHit);

const flagCriminal: Evaluator = (input) => {
  const f = new Facts(input);
  const v = f.raw('red_flags', 'arrests_charges_convictions');
  if (v === undefined || v === null || v === false || (Array.isArray(v) && v.length === 0)) return [];
  return [{ kind: 'redFlag', code: 'flag.criminal', note: f.isDiscuss('red_flags', 'arrests_charges_convictions') ? 'Caller chose to discuss arrests or convictions with the attorney.' : 'Caller reported an arrest, charge or conviction. Attorney review required.' }];
};

const flagPriorRemoval: Evaluator = (input) => {
  const f = new Facts(input);
  const v = f.str('history', 'prior_court_or_removal');
  if (f.isDiscuss('history', 'prior_court_or_removal')) return [{ kind: 'redFlag', code: 'flag.prior_removal', note: 'Caller chose to discuss prior court or removal history with the attorney.' }];
  if (v && v !== 'none') return [{ kind: 'redFlag', code: 'flag.prior_removal', note: `Prior court or removal history reported (${v}).` }];
  return [];
};

export const EVALUATORS: Readonly<Record<string, Evaluator>> = {
  'triage.urgent_flags': triageUrgentFlags,
  'entry.inspected': entryInspected,
  'bar.unlawful_presence_3y': bar3y,
  'bar.unlawful_presence_10y': bar10y,
  'bar.permanent': barPermanent,
  'asylum.one_year': asylumOneYear,
  'cspa.age_out': cspaAgeOut,
  'n400.residence': n400Residence,
  'n400.early_filing': n400EarlyFiling,
  'deadline.rfe': deadlineRfe,
  'flag.criminal': flagCriminal,
  'flag.prior_removal': flagPriorRemoval,
};
