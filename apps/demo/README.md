# Web demo

A clickable demo of the client app and the attorney review queue, for showing the firm how the agent behaves before the mobile app exists.

It runs the real Milestone 1 packages (agent orchestrator, guardrails, rules engine, intake schema, `MockCrmAdapter`, review queue, audit log) entirely in the browser. There is no server and nothing is saved: reloading the page starts fresh.

- **Mock data only.** The Sharma family seed and a fictional sample intake (Maya Gurung, 555 number).
- **No AI model.** `ScriptedDemoLlm` stands in for the LLM: fact answers come from the agent's template answerer and attorney drafts are a fixed, cautious text. The page says so.
- **Guardrails are the real code.** Disclosures, the "facts from your file" label, legal-question routing, urgent escalation, A-number masking and audit entries all come from the packages.

## Build

```sh
pnpm --filter @chhetry/demo build   # writes dist/index.html (open it directly) and dist/chhetry-demo.html
pnpm --filter @chhetry/demo test
```

Node-only APIs are swapped for browser shims at build time (`src/shims`): `node:crypto` (AES-256-GCM and SHA-256 via `@noble`), `node:fs` (inlines `prompts/system.md`), and `@anthropic-ai/sdk` (a stub; the demo never calls a model).

The demo's own client-screen strings (`src/strings.ts`) are machine drafts in Nepali and Bengali, like the rest of the catalog, and need native-speaker review.
