# Chhetry Law voice consultation layer

Multilingual (English, Nepali, Bengali) voice AI layer for the Chhetry Law client app. Full spec and guardrails: [CLAUDE.md](CLAUDE.md).

## Status: Milestone 0 (foundations)

| Package | What's in it |
| --- | --- |
| `packages/shared` | Core types (CLAUDE.md section 6), PII-safe logger and redactor, config helper |
| `packages/db` | Prisma schema (Person, Conversation, IntakeRecord, Assessment, ReviewItem, AuditLog), field encryption, masking, blind index, audit entry builder |
| `packages/crm` | `CrmAdapter` interface and `MockCrmAdapter` with Sharma family seed data |
| `packages/voice` | Provider-neutral STT/TTS/realtime interfaces and vendor compliance check |
| `packages/i18n` | en/ne/bn disclosure and label strings (ne/bn are machine drafts pending native review) |
| `packages/agent`, `rules`, `intake-schema`, `guardrails` | Placeholders for Milestone 1 |
| `apps/*` | Placeholders (Expo mobile, Fastify API, review console) |

## Develop

```sh
corepack enable
pnpm install
cp .env.example .env   # fill in keys locally; never commit .env
pnpm test
pnpm typecheck
pnpm db:validate
```
