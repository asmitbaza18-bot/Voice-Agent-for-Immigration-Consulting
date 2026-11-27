# Prompts

- `system.md`: system prompt for answering a client's question from their own file. **Draft, needs attorney review** (CLAUDE.md section 9).
  When it changes, bump `PROMPT_VERSION` in `src/prompts.ts`; the version is stamped on every AI output in the audit log.

The LLM does not choose dialog states or call tools in Milestone 1. Code does that (`src/machine.ts`, `src/conversation.ts`).
The LLM only writes the answer text, and every answer passes the output checker in `@chhetry/guardrails` before it is sent.
