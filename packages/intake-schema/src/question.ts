import { z } from 'zod';
import type { FieldValue, Lang } from '@chhetry/shared';

/** Intake modules built so far. Milestone 1 covers these; the rest follow (CLAUDE.md section 7). */
export type IntakeModuleId = 'triage' | 'core' | 'history' | 'family' | 'removal';

export type QuestionType =
  | 'boolean'
  | 'date' // stored as { kind: 'date', value: 'YYYY-MM-DD' }
  | 'text'
  | 'enum'
  | 'text_list'
  | 'number'
  | 'number_list';

export type LocalizedText = Readonly<Record<Lang, string>>;

export interface QuestionOption {
  value: string;
  label: LocalizedText;
}

export interface FollowUp {
  /** Ask the follow-up fields when this field's answer equals one of these values. */
  whenEquals: readonly (string | boolean)[];
  ask: readonly string[];
}

export interface Question {
  id: string;
  module: IntakeModuleId;
  prompt: LocalizedText;
  type: QuestionType;
  options?: readonly QuestionOption[];
  required: boolean;
  /** Ids of fields in the same module that are asked only after a matching answer. */
  followUps?: readonly FollowUp[];
  /** Sensitive answers are field-encrypted (packages/db) and never logged. Use gentle phrasing. */
  sensitive: boolean;
  /** The caller may answer "I'd rather discuss this with the attorney". */
  allowDiscussWithAttorney: boolean;
  /** Answer is stored encrypted (e.g. the A-number). Implies sensitive. */
  encrypted?: boolean;
}

export interface IntakeModule {
  id: IntakeModuleId;
  title: LocalizedText;
  questions: readonly Question[];
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Not a real calendar date');

export const DISCUSS_WITH_ATTORNEY = { kind: 'discuss_with_attorney' } as const;
const discussSchema = z.object({ kind: z.literal('discuss_with_attorney') });

/** Builds the zod schema that validates one answer to a question. */
export function answerSchema(q: Question): z.ZodType<FieldValue> {
  let base: z.ZodType<FieldValue>;
  switch (q.type) {
    case 'boolean':
      base = z.boolean();
      break;
    case 'date':
      base = z.object({ kind: z.literal('date'), value: isoDate });
      break;
    case 'text':
      base = z.string().trim().min(1).max(2000);
      break;
    case 'enum': {
      const values = (q.options ?? []).map((o) => o.value);
      if (values.length === 0) throw new Error(`Enum question ${q.module}.${q.id} has no options`);
      base = z.string().refine((v) => values.includes(v), { message: `Expected one of ${values.join(', ')}` });
      break;
    }
    case 'text_list':
      base = z.array(z.string().trim().min(1).max(500)).max(50);
      break;
    case 'number':
      base = z.number().finite().min(0).max(1_000_000_000);
      break;
    case 'number_list':
      base = z.array(z.number().finite().min(0).max(150)).max(30) ;
      break;
  }
  return q.allowDiscussWithAttorney ? (z.union([base, discussSchema]) as z.ZodType<FieldValue>) : base;
}

/** zod object schema for a whole module. Every field is optional until playback (required is checked there). */
export function moduleSchema(m: IntakeModule) {
  const shape: Record<string, z.ZodOptional<z.ZodType<FieldValue>>> = {};
  for (const q of m.questions) shape[q.id] = answerSchema(q).optional();
  return z.object(shape).strict();
}

/** Helper for writing questions compactly. */
export function L(en: string, ne: string, bn: string): LocalizedText {
  return { en, ne, bn };
}

export const YES_NO_UNSURE: readonly QuestionOption[] = [
  { value: 'yes', label: L('Yes', 'हो', 'হ্যাঁ') },
  { value: 'no', label: L('No', 'होइन', 'না') },
  { value: 'unsure', label: L('Not sure', 'थाहा छैन', 'নিশ্চিত নই') },
];
