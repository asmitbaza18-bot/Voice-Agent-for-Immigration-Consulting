import { z } from 'zod';
import type { UrgentFlag } from '@chhetry/shared';
import ruleFile from '../rules/starter-rules.json' with { type: 'json' };
import { EVALUATORS } from './evaluators.js';
import type { RuleContext, RuleInput, RuleMeta, RulesOutput } from './types.js';

export * from './types.js';
export * from './dates.js';
export { Facts } from './facts.js';
export { EVALUATORS };

const RuleFileSchema = z.object({
  version: z.string().min(1),
  notice: z.string(),
  owner: z.string(),
  rules: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/),
        description: z.string().min(1),
        inputs: z.array(z.string()).min(1),
        logic: z.string().min(1),
        output: z.string().min(1),
        citation: z.string().min(1),
        owner: z.string().min(1),
        verified: z.boolean(),
      }).strict(),
    )
    .min(1),
});

const parsed = RuleFileSchema.parse(ruleFile);

/** Stamped on every assessment (CLAUDE.md section 8). Bump in the JSON when any rule changes. */
export const RULES_VERSION: string = parsed.version;
export const RULES: readonly RuleMeta[] = parsed.rules;

for (const r of RULES) if (!EVALUATORS[r.id]) throw new Error(`Rule ${r.id} has no evaluator`);
for (const id of Object.keys(EVALUATORS)) if (!RULES.some((r) => r.id === id)) throw new Error(`Evaluator ${id} has no rule metadata`);

export function getRule(id: string): RuleMeta | undefined {
  return RULES.find((r) => r.id === id);
}

/**
 * Runs every rule. Rules decide; the LLM may explain the output but never
 * override it (CLAUDE.md section 3). Pure: same input and `today` give the same output.
 */
export function runRules(input: RuleInput, ctx: RuleContext): RulesOutput {
  const out: RulesOutput = {
    redFlags: [], deadlines: [], pathwayHints: [], urgentFlags: [],
    rulesVersion: RULES_VERSION,
    unverifiedRuleIds: RULES.filter((r) => !r.verified).map((r) => r.id),
  };
  for (const rule of RULES) {
    for (const hit of EVALUATORS[rule.id]!(input, ctx)) {
      const ruleId = rule.id;
      switch (hit.kind) {
        case 'redFlag': out.redFlags.push({ code: hit.code, note: hit.note, ruleId }); break;
        case 'deadline': out.deadlines.push({ label: hit.label, date: hit.date, ruleId }); break;
        case 'pathwayHint': out.pathwayHints.push({ code: hit.code, label: hit.label, dependsOn: hit.dependsOn, ruleId }); break;
        case 'urgentFlag': out.urgentFlags.push({ flag: hit.flag, note: hit.note, ruleId }); break;
      }
    }
  }
  out.deadlines.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Urgent flags only, for triage (guardrail 5). */
export function computeUrgentFlags(input: RuleInput, ctx: RuleContext): UrgentFlag[] {
  return [...new Set(EVALUATORS['triage.urgent_flags']!(input, ctx).flatMap((h) => (h.kind === 'urgentFlag' ? [h.flag] : [])))];
}
