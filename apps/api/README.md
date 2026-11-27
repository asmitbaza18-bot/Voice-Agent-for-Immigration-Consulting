# apps/api

Fastify API (CLAUDE.md section 12). Milestone 1 is text-first; the voice session gateway comes in Milestone 2.

```
pnpm --filter @chhetry/api dev      # in-memory, Sharma seed data, prints dev tokens
```

Set `ANTHROPIC_API_KEY` to answer with Claude. Without it, a deterministic template answers from the file.
`FIRM_TIME_ZONE` (default `America/New_York`, placeholder) sets "today" for the rules.

| Endpoint | Who | Notes |
| --- | --- | --- |
| `POST /v1/conversations` | anyone; a client token marks the caller as an existing client | returns `token` for `x-conversation-token` and the disclosures |
| `POST /v1/conversations/:id/disclosures` | conversation token | AI disclosure, recording consent, not-advice ack |
| `POST /v1/conversations/:id/messages`, `POST /v1/questions` | conversation token | free text; urgent check, classify, answer from file or route to attorney |
| `POST /v1/intake/:id/fields` `/skip` `/goal` `/corrections` `/assess` | conversation token | `:id` is the conversation id; `assess` confirms playback and queues the assessment |
| `GET /v1/me/cases`, `GET /v1/me/answers` | client | own file; attorney-approved answers only |
| `GET /v1/review`, `GET /v1/review/:id`, `POST /v1/review/:id/decision` | attorney | approve, edit_send, call_client, reject |
| `POST /v1/escalations`, `GET /v1/escalations` | staff roles | manual escalation and list |
| `GET /console` | anyone (data needs an attorney token) | minimal review console |

Every endpoint: auth, role check, audit row, and one PII-safe log line (route, status, timing; never bodies or tokens).
Auth is `DevTokenAuthenticator` in dev (refuses production). The real `Authenticator` plugs into the app's auth.
In production set `allowDraftLanguages: false` so ne/bn are refused until native review is done.
