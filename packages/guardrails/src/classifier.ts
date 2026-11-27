import type { UrgentFlag } from '@chhetry/shared';
import { matchesAllOf, normalize } from './match.js';
import {
  GENERAL_INFO_PATTERNS, LEGAL_PATTERNS, OFF_TOPIC_PATTERNS, URGENT_PATTERNS,
  type InputLabel, type KeywordPattern, type LegalReason,
} from './patterns.js';

export interface Classification {
  label: InputLabel;
  /** Pattern ids that matched, for the audit log. Never the user's text. */
  matchedPatterns: string[];
  reasons: LegalReason[];
  urgentFlags: UrgentFlag[];
  source: 'keywords' | 'keywords+llm';
}

/** Optional LLM labeler. It can raise severity, never lower it below what keywords found. */
export type LlmLabeler = (text: string) => Promise<InputLabel>;

const SEVERITY: Record<InputLabel, number> = { urgent: 3, legal_question: 2, fact: 1, general_info: 1, off_topic: 1 };

/** Most specific first, so `reasons[0]` is the best label for the attorney queue. */
const REASON_PRIORITY: readonly LegalReason[] = [
  'criminal', 'travel', 'self_filing', 'hearing_or_notice', 'deportation', 'eligibility', 'strategy', 'fees_timeline_policy_undecided', 'should_can',
];

function run(patterns: readonly KeywordPattern[], normalized: string): KeywordPattern[] {
  return patterns.filter((p) => matchesAllOf(normalized, p.allOf) !== null);
}

/** Deterministic keyword classifier. Runs every language's patterns. */
export function classifyKeywords(text: string): Classification {
  const n = normalize(text);
  const urgent = run(URGENT_PATTERNS, n);
  const legal = run(LEGAL_PATTERNS, n);
  const matched = [...urgent, ...legal];
  const base = {
    matchedPatterns: matched.map((p) => p.id),
    reasons: [...new Set(legal.map((p) => p.reason!).filter(Boolean))].sort((a, b) => REASON_PRIORITY.indexOf(a) - REASON_PRIORITY.indexOf(b)),
    urgentFlags: [...new Set(urgent.map((p) => p.urgentFlag!).filter(Boolean))],
    source: 'keywords' as const,
  };
  if (urgent.length) return { ...base, label: 'urgent' };
  if (legal.length) return { ...base, label: 'legal_question' };
  const general = run(GENERAL_INFO_PATTERNS, n);
  if (general.length) return { ...base, matchedPatterns: general.map((p) => p.id), label: 'general_info' };
  const off = run(OFF_TOPIC_PATTERNS, n);
  if (off.length) return { ...base, matchedPatterns: off.map((p) => p.id), label: 'off_topic' };
  return { ...base, label: 'fact' };
}

/**
 * Full input classifier (CLAUDE.md section 10). Keywords first; an LLM label,
 * if given, may move between the low-risk labels or raise to legal/urgent,
 * but can never downgrade a keyword hit. If the LLM fails, keywords stand.
 */
export async function classifyQuestion(text: string, llm?: LlmLabeler): Promise<Classification> {
  const kw = classifyKeywords(text);
  if (!llm || kw.label === 'urgent') return kw;
  let llmLabel: InputLabel;
  try {
    llmLabel = await llm(text);
  } catch {
    return kw;
  }
  if (!(llmLabel in SEVERITY)) return kw;
  const label = SEVERITY[llmLabel] >= SEVERITY[kw.label] ? llmLabel : kw.label;
  return { ...kw, label, source: 'keywords+llm' };
}

/** Escalation checker: any urgent keyword in any language forces the escalate path. */
export function checkEscalation(text: string): { urgent: boolean; flags: UrgentFlag[]; matchedPatterns: string[] } {
  const hits = run(URGENT_PATTERNS, normalize(text));
  return {
    urgent: hits.length > 0,
    flags: [...new Set(hits.map((h) => h.urgentFlag!).filter(Boolean))],
    matchedPatterns: hits.map((h) => h.id),
  };
}
