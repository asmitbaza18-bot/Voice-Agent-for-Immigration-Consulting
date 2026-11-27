# Rule files

`starter-rules.json` holds every rule's metadata in plain language: id, description, inputs, logic, output, citation, owner and `verified`.
The matching TypeScript logic is one small function per rule in `../src/evaluators.ts`. Worked examples for each rule are in `../test/fixtures.ts`.

**Every rule is `verified: false`.** They are engineering starting points, not legal conclusions (CLAUDE.md section 8).

How the attorney reviews a rule:

1. Read the rule's `logic` here and its fixtures in `test/fixtures.ts`.
2. Mark corrections in a PR comment, or edit the `logic` text; engineering updates the evaluator and fixtures to match.
3. When it is right, set `verified: true`, set `owner`, and bump `version`. The version is stamped on every assessment.

Open decision: which attorney owns the rules (`owner` is `UNASSIGNED`).
