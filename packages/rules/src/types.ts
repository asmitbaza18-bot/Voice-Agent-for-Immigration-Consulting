import type { FieldValue, Goal, UrgentFlag } from '@chhetry/shared';

/** A notice the firm has on file, e.g. an RFE. Dates are 'YYYY-MM-DD'. */
export interface Notice {
  kind: 'rfe';
  noticeDate: string;
  /** Response period printed on the notice, in days. */
  responseDays: number;
  label?: string;
}

export interface RuleInput {
  goal?: Goal;
  /** Intake answers by module, including 'triage'. Values are typed FieldValues from intake-schema. */
  modules: Partial<Record<string, Record<string, FieldValue>>>;
  notices?: Notice[];
}

export interface RuleContext {
  /** Today's date, 'YYYY-MM-DD'. Always injected so tests and audits are reproducible. */
  today: string;
}

export type RuleHit =
  | { kind: 'redFlag'; code: string; note: string }
  | { kind: 'deadline'; label: string; date: string }
  | { kind: 'pathwayHint'; code: string; label: string; dependsOn: string[] }
  | { kind: 'urgentFlag'; flag: UrgentFlag; note: string };

export type Evaluator = (input: RuleInput, ctx: RuleContext) => RuleHit[];

export interface RuleMeta {
  id: string;
  description: string;
  inputs: string[];
  logic: string;
  output: string;
  citation: string;
  owner: string;
  verified: boolean;
}

export interface RulesOutput {
  redFlags: { code: string; note: string; ruleId: string }[];
  deadlines: { label: string; date: string; ruleId: string }[];
  pathwayHints: { code: string; label: string; dependsOn: string[]; ruleId: string }[];
  urgentFlags: { flag: UrgentFlag; note: string; ruleId: string }[];
  rulesVersion: string;
  /** Rules that ran without attorney verification. Non-empty until Milestone 4 sign-off. */
  unverifiedRuleIds: string[];
}
