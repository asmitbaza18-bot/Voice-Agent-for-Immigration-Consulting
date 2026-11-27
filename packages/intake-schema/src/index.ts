import type { FieldValue, Goal, Lang } from '@chhetry/shared';
import { core } from './modules/core.js';
import { family } from './modules/family.js';
import { history } from './modules/history.js';
import { removal } from './modules/removal.js';
import { triage } from './modules/triage.js';
import { answerSchema, L, type IntakeModule, type IntakeModuleId, type Question, type QuestionOption } from './question.js';

export * from './question.js';
export { core, family, history, removal, triage };

/**
 * Translation state of the question text. ne/bn are machine drafts and must be
 * reviewed by a native speaker (and wording of sensitive questions by the attorney).
 */
export const QUESTION_TRANSLATION_STATUS = {
  en: 'source',
  ne: 'machine_draft_needs_native_review',
  bn: 'machine_draft_needs_native_review',
} as const;

export const MODULES: Readonly<Record<IntakeModuleId, IntakeModule>> = { triage, core, history, family, removal };

export const GOAL_OPTIONS: readonly (QuestionOption & { value: Goal })[] = [
  { value: 'family', label: L('Help through a family member', 'परिवारको सदस्य मार्फत', 'পরিবারের সদস্যের মাধ্যমে') },
  { value: 'employment', label: L('Help through a job', 'जागिर मार्फत', 'চাকরির মাধ্যমে') },
  { value: 'humanitarian', label: L('Safety or humanitarian protection', 'सुरक्षा वा मानवीय संरक्षण', 'নিরাপত্তা বা মানবিক সুরক্ষা') },
  { value: 'removal_defense', label: L('A court or deportation case', 'अदालत वा डिपोर्ट मुद्दा', 'আদালত বা ডিপোর্টেশন মামলা') },
  { value: 'naturalization', label: L('Becoming a US citizen', 'अमेरिकी नागरिक बन्ने', 'মার্কিন নাগরিক হওয়া') },
  { value: 'status_question', label: L('A question about my status', 'मेरो स्थितिबारे प्रश्न', 'আমার স্ট্যাটাস নিয়ে প্রশ্ন') },
  { value: 'other', label: L('Something else', 'अरू केही', 'অন্য কিছু') },
];

export const GOAL_PROMPT = L(
  'What do you need help with today?',
  'आज तपाईंलाई केमा सहयोग चाहिएको छ?',
  'আজ আপনার কোন বিষয়ে সাহায্য দরকার?',
);

/**
 * The one goal-specific module asked after history (CLAUDE.md section 7).
 * employment, humanitarian and naturalization modules are not built yet
 * (later milestone), so those goals skip straight to red flags for now.
 */
export function moduleForGoal(goal: Goal): IntakeModuleId | null {
  switch (goal) {
    case 'family':
      return 'family';
    case 'removal_defense':
      return 'removal';
    default:
      return null;
  }
}

/** Modules asked after triage and goal, in order, for a given goal. */
export function intakeModulesForGoal(goal: Goal): IntakeModuleId[] {
  const m = moduleForGoal(goal);
  return m ? ['core', 'history', m] : ['core', 'history'];
}

export function getQuestion(module: IntakeModuleId, field: string): Question | undefined {
  return MODULES[module]?.questions.find((q) => q.id === field);
}

export function isIntakeModuleId(v: string): v is IntakeModuleId {
  return Object.prototype.hasOwnProperty.call(MODULES, v);
}

export type ValidationResult = { ok: true; value: FieldValue } | { ok: false; error: string };

/** Validates one answer against its question. Unknown fields are rejected. */
export function validateAnswer(module: string, field: string, value: unknown): ValidationResult {
  if (!isIntakeModuleId(module)) return { ok: false, error: `Unknown module ${module}` };
  const q = getQuestion(module, field);
  if (!q) return { ok: false, error: `Unknown field ${module}.${field}` };
  const r = answerSchema(q).safeParse(value);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}

function followUpTargets(m: IntakeModule): Set<string> {
  const s = new Set<string>();
  for (const q of m.questions) for (const f of q.followUps ?? []) for (const id of f.ask) s.add(id);
  return s;
}

/** A question is active unless it is a follow-up whose trigger answer has not been given. */
export function isActive(m: IntakeModule, q: Question, answers: Readonly<Record<string, FieldValue>>): boolean {
  if (!followUpTargets(m).has(q.id)) return true;
  return m.questions.some((parent) =>
    (parent.followUps ?? []).some((f) => {
      if (!f.ask.includes(q.id)) return false;
      const a = answers[parent.id];
      return (typeof a === 'string' || typeof a === 'boolean') && f.whenEquals.includes(a);
    }),
  );
}

/** Next unanswered, active question in a module, or null when the module is done. `skipped` holds field ids. */
export function nextQuestion(
  module: IntakeModuleId,
  answers: Readonly<Record<string, FieldValue>>,
  skipped: readonly string[] = [],
): Question | null {
  const m = MODULES[module];
  for (const q of m.questions) {
    if (!isActive(m, q, answers)) continue;
    if (q.id in answers || skipped.includes(q.id)) continue;
    return q;
  }
  return null;
}

/** Required, active questions that are still unanswered. Checked before playback is confirmed. */
export function missingRequired(module: IntakeModuleId, answers: Readonly<Record<string, FieldValue>>): string[] {
  const m = MODULES[module];
  return m.questions.filter((q) => q.required && isActive(m, q, answers) && !(q.id in answers)).map((q) => q.id);
}

export function promptFor(q: Question, lang: Lang): string {
  return q.prompt[lang];
}

/** Human-readable answer for playback. Sensitive answers are masked; the caller hears them only if they ask. */
export function formatAnswer(q: Question, value: FieldValue, lang: Lang): string {
  const yesNo = { en: ['Yes', 'No'], ne: ['हो', 'होइन'], bn: ['হ্যাঁ', 'না'] }[lang];
  const discuss = { en: 'Discuss with attorney', ne: 'वकिलसँग कुरा गर्ने', bn: 'আইনজীবীর সাথে আলোচনা' }[lang];
  if (value === null) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.kind === 'discuss_with_attorney') return discuss;
    if (value.kind === 'date') return value.value;
    if (value.kind === 'encrypted') return '••••';
  }
  if (q.encrypted && typeof value === 'string') return `••••${value.slice(-3)}`;
  if (typeof value === 'boolean') return value ? yesNo[0]! : yesNo[1]!;
  if (q.type === 'enum' && typeof value === 'string') return q.options?.find((o) => o.value === value)?.label[lang] ?? value;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
