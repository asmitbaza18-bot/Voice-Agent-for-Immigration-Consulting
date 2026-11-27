# ADR 0001: Monorepo and stack

Date: 2026-11-27 · Status: accepted

## Context
There is no production mobile app, only an HTML prototype. CLAUDE.md section 4 suggests a stack to confirm.

## Decision
- TypeScript (strict) everywhere, pnpm workspaces + Turborepo, layout from CLAUDE.md section 5.
- Mobile: Expo / React Native (confirmed by ASMIT; revisit if the firm's team already has a mobile codebase).
- Database: PostgreSQL + Prisma 7. Sensitive columns are encrypted in the application with AES-256-GCM (`packages/db/src/encryption.ts`), with HMAC blind indexes for lookups.
- Tests: Vitest.
- Internal packages export TypeScript source directly (`exports: ./src/index.ts`); no build step until an app needs one.

## Consequences
- Key management: `FIELD_ENCRYPTION_KEYS` (key ring, first key encrypts) and `FIELD_LOOKUP_HMAC_KEY` come from the secret manager in production. Rotating the HMAC key requires re-indexing.
- `AuditLog` is append-only, enforced by a database trigger in the initial migration.
