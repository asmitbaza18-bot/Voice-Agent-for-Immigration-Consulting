# ADR 0004: Code-driven orchestrator, LLM writes text only

Date: 2026-11-27 · Status: accepted (Milestone 1)

## Context
Milestone 1 builds the whole consultation flow with text. CLAUDE.md asks for "rules decide, LLM explains", human review for anything legal, and tests that do not need a live API key.

## Decision
- **The dialog is a pure state machine** (`packages/agent/src/machine.ts`), driven by typed user actions. The LLM never picks a state or calls a tool in Milestone 1. Tools exist with zod schemas, permission checks and audit rows, and `toolJsonSchemas()` exposes them for LLM tool use later.
- **The LLM is behind `LlmAdapter`.** `AnthropicLlmAdapter` (Claude, default model `claude-opus-5-5`, overridable with `ANTHROPIC_MODEL`) sends `inference_geo: 'us'`, uses server-side refusal fallback, and is only used to write the answer text and attorney drafts. `FakeLlmAdapter` drives tests. With no LLM configured, a deterministic template answerer replies from the file.
- **Guardrails are deterministic and run on every turn:** urgent keywords (en/ne/bn) before anything else; keyword classification that an LLM label can raise but never lower; an output checker on every client-facing message that blocks outcome promises, eligibility statements, restricted advice, criminal advice and dates not present in the case facts, and adds the localized label.
- **Only attorney-approved text reaches a client** (`ReviewQueue.clientAnswers`). Drafts are stored field-encrypted and shown only in the review console.
- **Receipt numbers and A-numbers are not sent to the LLM.** The model gets case types, statuses, dates, steps and missing documents only.

## Consequences
- Small, predictable surface to test: every transition, rule, guardrail fixture and tool permission has a test.
- The keyword lists over-route to the attorney (for example any "can I" question). That is the safe direction; tune with real labeled data from testers.
- Follow-ups: run `AnthropicLlmAdapter` through a vendor-compliance check like `assertVendorCompliant` once the firm's Anthropic terms reference is on file (guardrail 9); replace in-memory stores with Prisma repositories; red_flags and documents intake modules; the remaining goal modules.
