import type { Lang } from '@chhetry/shared';
import { bn } from './locales/bn.js';
import { en, type MessageKey, type Messages } from './locales/en.js';
import { ne } from './locales/ne.js';

export type { MessageKey, Messages };

/** Bump when any disclosure text changes; stored on Conversation.disclosuresVersion. */
export const DISCLOSURES_VERSION = '2026-11-27.draft-1';

export const CATALOGS: Readonly<Record<Lang, Messages>> = { en, ne, bn };

export type TranslationStatus = 'source' | 'machine_draft_needs_native_review' | 'native_reviewed' | 'attorney_approved';

/**
 * Review state per language. Flip only after a native speaker (and, for
 * disclosures, the attorney) signs off. The API refuses to serve a language
 * whose status is a draft in production (enforced in Milestone 1).
 */
export const TRANSLATION_STATUS: Readonly<Record<Lang, TranslationStatus>> = {
  en: 'source',
  ne: 'machine_draft_needs_native_review',
  bn: 'machine_draft_needs_native_review',
};

/** Guardrail 6: the disclosures every conversation opens with, in order. */
export const DISCLOSURE_KEYS = [
  'disclosure.ai',
  'disclosure.recording_consent',
  'disclosure.info_not_advice',
  'disclosure.confidentiality',
  'disclosure.confirm',
] as const satisfies readonly MessageKey[];

export function t(lang: Lang, key: MessageKey): string {
  const s = CATALOGS[lang][key];
  if (!s) throw new Error(`Missing ${lang} string for ${key}`);
  return s;
}

export function disclosures(lang: Lang): { key: MessageKey; text: string }[] {
  return DISCLOSURE_KEYS.map((key) => ({ key, text: t(lang, key) }));
}

/** Guardrail 7: the label on every AI answer shown to a client. */
export function factsNotAdviceLabel(lang: Lang): string {
  return t(lang, 'label.facts_not_advice');
}

export function needsNativeReview(lang: Lang): boolean {
  return TRANSLATION_STATUS[lang] === 'machine_draft_needs_native_review';
}
