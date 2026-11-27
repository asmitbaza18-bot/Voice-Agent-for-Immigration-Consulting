import type { Lang } from '@chhetry/shared';
import { factsNotAdviceLabel, t } from '@chhetry/i18n';
import { normalize } from './match.js';

/**
 * Output checker (CLAUDE.md section 10, guardrails 2, 3, 4, 7). Runs on every
 * client-facing AI message before it is sent. Patterns run in every language,
 * because a model may answer in a different language than asked.
 *
 * ne and bn phrases are MACHINE DRAFTS and need native-speaker review.
 */

export type ViolationCode =
  | 'outcome_promise'   // guardrail 2
  | 'restricted_advice' // guardrail 3: leave the US, skip a hearing, ignore a notice, self-file
  | 'criminal_advice'   // guardrail 4
  | 'eligibility_determination' // guardrail 1: legal judgment in an unreviewed answer
  | 'unsupported_date'  // date not found in the facts the answer was built from
  | 'missing_label';    // guardrail 7

export interface Violation {
  code: ViolationCode;
  /** Id of the rule that fired. The matched text is not stored, it may hold PII. */
  ruleId: string;
}

interface OutputRule {
  id: string;
  code: ViolationCode;
  re: RegExp;
}

const NEG_EN = String.raw`(?<!\b(?:not|never|cannot|can't|can not|don't|do not|won't|no)\s(?:\w+\s){0,2})`;

const EN_RULES: OutputRule[] = [
  { id: 'en.will_win', code: 'outcome_promise', re: /\byou(?:'ll| will| are going to)\s+(?:definitely\s+|surely\s+|certainly\s+|probably\s+)?(?:qualify|win|be approved|be granted|get approved|get (?:your|a|the) (?:green card|visa|status|citizenship|approval|asylum|work permit)|get asylum|stay in the (?:us|country))\b/i },
  { id: 'en.guarantee', code: 'outcome_promise', re: new RegExp(`${NEG_EN}\\bguarantee(?:d|s)?\\b`, 'i') },
  { id: 'en.for_sure', code: 'outcome_promise', re: /\b(?:approved|granted|accepted|win) for sure\b|\bfor sure (?:be )?(?:approved|granted)\b/i },
  { id: 'en.hundred_percent', code: 'outcome_promise', re: /\b100\s?(?:%|percent\b)/i },
  { id: 'en.definitely', code: 'outcome_promise', re: /\b(?:definitely|certainly|surely)\s+(?:be\s+)?(?:approved|granted|win|qualify)\b/i },
  { id: 'en.no_risk', code: 'outcome_promise', re: /\bno (?:risk|chance) of (?:denial|being denied|deportation|removal)\b|\bnothing to worry about\b/i },
  { id: 'en.you_qualify', code: 'eligibility_determination', re: /\byou (?:qualify|are eligible|are not eligible|aren't eligible|don't qualify|do not qualify|are able to get)\b/i },
  { id: 'en.leave_us', code: 'restricted_advice', re: new RegExp(`${NEG_EN}\\b(?:leave|depart|exit) (?:the )?(?:us|u\\.s\\.|united states|country)\\b|\\bself[- ]deport`, 'i') },
  { id: 'en.go_back', code: 'restricted_advice', re: /\byou (?:should|need to|must|could|can|may want to)\s+(?:just\s+)?(?:go back|return|move back) (?:to (?:your (?:home )?country|nepal|bangladesh|india)|home)\b/i },
  { id: 'en.skip_hearing', code: 'restricted_advice', re: new RegExp(`${NEG_EN}\\b(?:skip|miss|ignore)\\b[^.!?]{0,25}\\b(?:hearing|court|interview|appointment|check-in)\\b|\\b(?:don't go to|do not go to|don't attend|do not attend|no need to (?:go to|attend)|don't need to (?:go to|attend)|do not need to (?:go to|attend))\\b[^.!?]{0,25}\\b(?:hearing|court|interview|appointment|check-in)\\b`, 'i') },
  { id: 'en.ignore_notice', code: 'restricted_advice', re: new RegExp(`${NEG_EN}\\bignore\\b[^.!?]{0,25}\\b(?:notice|letter|rfe|summons|request)\\b|\\b(?:don't|do not|no need to) (?:respond|reply) to\\b`, 'i') },
  { id: 'en.self_file', code: 'restricted_advice', re: /\b(?:file|submit|send) (?:it |the form |the application |this |that )?(?:yourself|on your own)\b|\byou (?:don't|do not) need (?:a|an) (?:lawyer|attorney)\b|\b(?:file|apply) without (?:a|an) (?:lawyer|attorney)\b/i },
  { id: 'en.plead', code: 'criminal_advice', re: /\b(?:plead|plea deal|plead guilty|plead no contest)\b|\btell (?:the )?(?:police|officer|judge|prosecutor)\b|\bexpunge/i },
];

/** Substring rules for scripts without ASCII word boundaries. */
const PHRASES: { id: string; code: ViolationCode; phrases: string[] }[] = [
  { id: 'ne.promise', code: 'outcome_promise', phrases: ['पक्का स्वीकृत', 'पक्का पाउनुहुन्छ', 'पक्कै पाउनुहुन्छ', 'ग्यारेन्टी छ', 'ग्यारेन्टी दिन्छु', 'निश्चित रूपमा स्वीकृत', 'अवश्य स्वीकृत', 'तपाईंले जित्नुहुनेछ', 'स्वीकृत हुनेछ', 'ग्रिन कार्ड पाउनुहुनेछ', '१००%'] },
  { id: 'ne.eligible', code: 'eligibility_determination', phrases: ['तपाईं योग्य हुनुहुन्छ', 'तपाईं योग्य हुनुहुन्न', 'तपाईंको योग्यता पुग्छ'] },
  { id: 'ne.restricted', code: 'restricted_advice', phrases: ['देश छोड्नुहोस्', 'देश छाड्नुहोस्', 'अमेरिका छोड्नुहोस्', 'नेपाल फर्कनुहोस्', 'सुनुवाइमा नजानुहोस्', 'सुनुवाइमा जानु पर्दैन', 'अदालत नजानुहोस्', 'अदालत जानु पर्दैन', 'पत्रलाई बेवास्ता', 'जवाफ दिनु पर्दैन', 'आफैं फाइल गर्नुहोस्', 'आफैँ फाइल गर्नुहोस्', 'वकिल चाहिँदैन'] },
  { id: 'ne.criminal', code: 'criminal_advice', phrases: ['दोष स्वीकार गर्नुहोस्', 'प्रहरीलाई भन्नुहोस्'] },
  { id: 'bn.promise', code: 'outcome_promise', phrases: ['নিশ্চিতভাবে অনুমোদিত', 'অবশ্যই অনুমোদিত', 'গ্যারান্টি দিচ্ছি', 'গ্যারান্টি আছে', 'আপনি জিতবেন', 'অনুমোদিত হবে', 'গ্রিন কার্ড পাবেন', '১০০%'] },
  { id: 'bn.eligible', code: 'eligibility_determination', phrases: ['আপনি যোগ্য', 'আপনি যোগ্য নন'] },
  { id: 'bn.restricted', code: 'restricted_advice', phrases: ['দেশ ছেড়ে চলে যান', 'যুক্তরাষ্ট্র ছেড়ে', 'দেশে ফিরে যান', 'শুনানিতে যাবেন না', 'শুনানিতে যাওয়ার দরকার নেই', 'আদালতে যাবেন না', 'আদালতে যাওয়ার দরকার নেই', 'চিঠি উপেক্ষা', 'উত্তর দেওয়ার দরকার নেই', 'নিজেই ফাইল করুন', 'আইনজীবীর দরকার নেই'] },
  { id: 'bn.criminal', code: 'criminal_advice', phrases: ['দোষ স্বীকার করুন', 'পুলিশকে বলুন'] },
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Extracts ISO and English long-form dates ("February 18, 2027") as YYYY-MM-DD. */
export function extractDates(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  const re = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(re)) {
    const mm = String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, '0');
    out.add(`${m[3]}-${mm}-${m[2]!.padStart(2, '0')}`);
  }
  return [...out];
}

export interface CheckOptions {
  /** Require the "facts from your file" label (guardrail 7). Default true. */
  requireLabel?: boolean;
  /** If set, every date in the text must be one of these (dates from the tool results). */
  allowedDates?: readonly string[];
}

export function checkOutput(text: string, lang: Lang, opts: CheckOptions = {}): { ok: boolean; violations: Violation[] } {
  const violations: Violation[] = [];
  for (const r of EN_RULES) if (r.re.test(text)) violations.push({ code: r.code, ruleId: r.id });
  const n = normalize(text);
  for (const p of PHRASES) if (p.phrases.some((ph) => n.includes(normalize(ph)))) violations.push({ code: p.code, ruleId: p.id });
  if (opts.allowedDates) {
    const allowed = new Set(opts.allowedDates);
    if (extractDates(text).some((d) => !allowed.has(d))) violations.push({ code: 'unsupported_date', ruleId: 'facts.dates' });
  }
  if ((opts.requireLabel ?? true) && !text.includes(factsNotAdviceLabel(lang))) violations.push({ code: 'missing_label', ruleId: 'label.facts_not_advice' });
  return { ok: violations.length === 0, violations };
}

export interface EnforceResult {
  text: string;
  blocked: boolean;
  violations: Violation[];
}

/**
 * Returns text that is safe to send. A missing label is fixed by appending it.
 * Any other violation blocks the answer and replaces it with a safe handoff
 * message. The caller must log every block (audit action 'ai.output.blocked').
 */
export function enforceOutput(text: string, lang: Lang, opts: CheckOptions = {}): EnforceResult {
  const { violations } = checkOutput(text, lang, opts);
  const label = factsNotAdviceLabel(lang);
  const hard = violations.filter((v) => v.code !== 'missing_label');
  if (hard.length) return { text: `${t(lang, 'agent.answer_blocked')}\n\n${label}`, blocked: true, violations };
  if (violations.length) return { text: `${text.trimEnd()}\n\n${label}`, blocked: false, violations };
  return { text, blocked: false, violations };
}
