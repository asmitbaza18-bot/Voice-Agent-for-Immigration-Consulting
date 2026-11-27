# ADR 0002: Build against MockCrmAdapter first

Date: 2026-11-27 · Status: accepted

## Context
The firm uses a custom CRM, crm4attorney.com. Its API availability and auth method are unconfirmed; docs are being requested from its dev team.

## Decision
Keep the `CrmAdapter` interface from CLAUDE.md section 11 unchanged and build only `MockCrmAdapter` (in-memory, Sharma family seed data) for now.

## Next
When crm4attorney.com docs arrive: decide between a direct `Crm4AttorneyAdapter` and a local Postgres mirror plus sync job (CLAUDE.md section 4), and record it in a new ADR.
