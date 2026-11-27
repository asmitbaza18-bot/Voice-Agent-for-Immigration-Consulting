# CLAUDE.md: Chhetry Law Voice Consultation Layer

This file gives Claude Code the context to build the voice AI consultation layer for the Chhetry Law client app. Read it fully before writing code. Keep it updated as decisions are made.

---

## 1. What we are building

A multilingual voice AI layer that runs through the whole immigration consultation journey in the Chhetry Law app (iPhone and Android), with the firm's phone line and website as extra entry points into the same agent.

The agent:

1. Runs **new-client voice intake** with urgent triage, then books a paid consult.
2. Answers **existing clients' questions from their own case file** ("Ask by voice").
3. **Explains letters** (USCIS, EOIR, firm documents) in plain language, read aloud.
4. Runs **hearing and interview preparation** (checklists, practice).
5. Routes **every legal question** to an attorney review queue. Only attorney-approved advice reaches a client.
6. Writes everything back to the firm's **case-management CRM** as structured fields.

Launch languages: **English, Nepali, Bengali**. Next: Hindi, Spanish.

A clickable UI prototype already exists (roles: Public tracker, New client intake, Client, Staff, Attorney, Management, Admin, Super Admin). Match its screens, copy and flows where possible.

---

## 2. Non-negotiable guardrails

These are product requirements, not suggestions. Every PR must respect them. Add tests for each.

1. **No unreviewed legal advice.** The agent may give (a) facts from the client's own file, (b) general information, (c) intake questions. Anything that needs legal judgment (eligibility, travel, "should I", "can I", strategy) is classified as `legal_question` and sent to the attorney review queue.
2. **Never promise outcomes.** No "you will qualify", "you will win", "approved for sure".
3. **Never tell a person to** leave the US, skip a hearing, ignore a notice, or file anything themselves.
4. **No criminal-law advice.** Collect facts only; mark for attorney.
5. **Urgent triage first.** Detention, a hearing within 7 days, a removal order, ICE contact, a deadline within 14 days, or danger triggers an immediate escalation (live transfer or on-call alert). The agent stops intake and escalates.
6. **Disclosures at the start of every conversation:** AI disclosure, recording consent, "general information; an attorney will review", confidentiality.
7. **Every AI answer shown to a client carries** the label "Facts from your file only, not legal advice" (localized).
8. **Sensitive data handling:** A-numbers, criminal history, persecution details, immigration status are encrypted at field level, masked in UI by default (show last 3 digits), and never sent to logs or analytics.
9. **Vendors must not train on our data.** Only use AI, speech and telephony providers under no-training, US-region terms.
10. **Audit everything:** every read and write of client data, every AI output, every attorney approval.

The firm's immigration attorney owns the rules engine and scripts. Code must make their review easy (versioned rules, readable YAML/JSON, tests per rule).

---

## 3. Architecture

```
Channels:  Mobile app voice  |  Phone line  |  Website widget
                    \             |             /
                Voice layer (telephony, STT, TTS, language detection)
                                  |
                Agent orchestrator (dialog state machine, triage, intake, escalation)
                 /                                              \
   Intelligence                                          Firm records and people
   - Rules engine (deterministic legal tests)            - CRM adapter (system of record)
   - LLM reasoning (conversation, summaries, memos)      - Document store (encrypted, OCR)
   - Retrieval over curated legal sources                - Calendar, SMS, payments
   - Guardrails (classifier + output checks)             - Attorney review console
                                  |
             Security and audit across every layer
```

Design principles:

- **Provider-agnostic.** Wrap STT, TTS, LLM, telephony and CRM behind interfaces so vendors can be swapped.
- **Rules decide, LLM explains.** Legal tests (bars, deadlines, eligibility gates) come from the rules engine, never from free LLM output.
- **Structured first.** Every intake answer is a typed field. Transcripts are secondary.
- **Human in the loop by default** for anything legal.

---

## 4. Suggested stack (confirm before building; change if the existing app uses something else)

| Layer | Default choice | Notes |
| --- | --- | --- |
| Language | TypeScript everywhere | Strict mode |
| Monorepo | pnpm workspaces + Turborepo | |
| Mobile app | Expo (React Native) | Match the prototype screens |
| Backend API | Node.js + Fastify | REST + WebSocket for voice sessions |
| Database | PostgreSQL + Prisma | Field-level encryption for sensitive columns |
| Queue / jobs | BullMQ + Redis | Reminders, review queue, sync jobs |
| Voice | Interface with adapters: OpenAI Realtime, Vapi, Retell, or ElevenLabs Agents | Start with one adapter |
| Telephony | Twilio (adapter) | Phone line entry |
| LLM | Anthropic Claude via API (adapter allows others) | Tool use for rules engine and CRM lookups |
| Retrieval | pgvector | Curated, versioned legal source library |
| Auth | Existing app auth; OTP + biometrics on device | |
| Payments | Stripe | Consult fee, Client Plus subscription |
| Hosting | US region cloud | Encrypted storage, audit logging |

If the firm's CRM already has an API, build a `CrmAdapter` against it. Otherwise start with a local Postgres mirror and a sync job.

---

## 5. Repository layout

```
/apps
  /mobile            Expo app (client, staff, attorney views)
  /api               Fastify API + voice session gateway
  /review-console    Web app for attorney review queue (can be part of mobile first)
/packages
  /agent             Orchestrator: dialog state machine, prompts, tools
  /rules             Rules engine + rule files + tests
  /intake-schema     Intake modules as typed schema (zod) + i18n question text
  /voice             STT/TTS/realtime adapters
  /crm               CrmAdapter interface + implementations
  /guardrails        Legal-question classifier, output checks, disclaimers
  /i18n              en, ne, bn strings
  /db                Prisma schema, migrations, encryption helpers
  /shared            Types, logger (PII-safe), config
/docs
  decisions/         Architecture decision records
  scripts/           Attorney-approved conversation scripts (versioned)
```

---

## 6. Core data model (starting point)

```ts
// packages/shared/types.ts
export type Lang = 'en' | 'ne' | 'bn';
export type Channel = 'app' | 'phone' | 'web';

export interface Person {
  id: string;
  fullName: string;
  otherNames?: string[];
  phone?: string;
  email?: string;
  smsConsent: boolean;
  preferredLang: Lang;
  aNumber?: EncryptedString;          // masked in UI
  countryOfBirth?: string;
  citizenships?: string[];
  state?: string;
  city?: string;
}

export interface Conversation {
  id: string;
  channel: Channel;
  lang: Lang;
  personId?: string;
  startedAt: string;
  disclosuresAccepted: boolean;
  recordingConsent: boolean;
  urgentFlags: UrgentFlag[];
  state: AgentState;
  transcriptRef: string;              // encrypted blob
  summary?: string;
}

export type UrgentFlag =
  | 'detained' | 'hearing_within_7_days' | 'removal_order' | 'ice_contact'
  | 'deadline_within_14_days' | 'stuck_abroad' | 'danger';

export interface IntakeRecord {
  id: string;
  conversationId: string;
  goal: Goal;
  modules: Partial<Record<ModuleId, Record<string, FieldValue>>>;
  uncertainFields: string[];          // caller unsure
  discussWithAttorney: string[];      // sensitive items the caller preferred not to answer
  documents: DocumentRef[];
}

export type Goal = 'family' | 'employment' | 'humanitarian' | 'removal_defense'
  | 'naturalization' | 'status_question' | 'other';

export type ModuleId = 'core' | 'history' | 'family' | 'employment'
  | 'humanitarian' | 'removal' | 'naturalization' | 'red_flags' | 'documents';

export interface Assessment {
  id: string;
  intakeId: string;
  pathways: { code: string; label: string; confidence: 'low' | 'medium' | 'high'; dependsOn: string[] }[];
  redFlags: { code: string; note: string; ruleId: string }[];
  deadlines: { label: string; date: string; ruleId: string }[];
  documentChecklist: { item: string; have: boolean }[];
  memoMarkdown: string;
  rulesVersion: string;
  status: 'pending_review' | 'approved' | 'edited' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ReviewItem {
  id: string;
  kind: 'assessment' | 'legal_question';
  personId: string;
  question?: string;                  // for legal_question
  aiDraft: string;
  status: 'open' | 'approved' | 'edited_sent' | 'call_client' | 'rejected';
  attorneyId?: string;
}
```

---

## 7. Intake modules

Order of a conversation: **disclosures → urgent triage → goal → core → history → one matching module → red flags → documents → playback and confirm → next step.** Target 10 to 15 minutes. Ask only the modules that match the goal.

| Module | Fields |
| --- | --- |
| disclosures | ai_disclosure_ack, recording_consent, language, info_not_advice_ack |
| triage | detained, hearing_date, has_nta_or_removal_order, ice_contact, upcoming_deadline (type, date), stuck_abroad, in_danger |
| core | full_name, other_names, phone, email, sms_consent, case_for (self/relative + relationship), state, city, goal_free_text, country_of_birth, citizenships, in_us, other_parties (conflict check), lead_source |
| history | last_entry_manner (visa/vwp/ewi/parole), last_entry_date, i94, current_status, status_expiry, entries_departures, prior_applications (+ receipt numbers), denials, prior_court_or_removal, a_number, prior_attorney |
| family | relationship_to_usc_or_lpr, sponsor_status, marriage_date, prior_marriages, sponsor_income_range, children_ages |
| employment | employer, title, salary_range, education, degree_country, current_visa, perm_filed, i140_filed, priority_date, extraordinary_evidence |
| humanitarian | fear_of_return, harm_source, us_arrival_date, crime_victim, police_cooperation, trafficking, abuse_by_usc_lpr_relative, under_21_abused_abandoned, tps_nationality |
| removal | hearing_date, court_location, case_stage, years_in_us, usc_lpr_relatives, ice_checkins |
| naturalization | lpr_since, married_to_usc_years, trips_over_6_months, taxes_filed, selective_service, false_claim_or_voting |
| red_flags | arrests_charges_convictions (date, state, outcome), false_documents, misrepresentation, false_claim_citizenship, unauthorized_work |
| documents | passport, i94, visa, i797_notices, ead_or_green_card, court_notices, police_court_records, marriage_birth_certs |

Implementation notes:

- Define each module in `packages/intake-schema` as zod schemas + question text in en/ne/bn.
- Each question has: `id`, `prompt` (per language), `type`, `required`, `followUps`, `sensitive` (bool), `allowDiscussWithAttorney` (bool).
- Sensitive questions use gentle phrasing and accept "discuss with attorney".
- Always play back a summary and get confirmation before saving as confirmed.

---

## 8. Rules engine

Deterministic, versioned, attorney-owned. Rules live as data (YAML or JSON) plus small TS evaluators. Each rule has an id, description, inputs, logic, output, legal citation, owner, and tests.

> **ATTORNEY MUST VERIFY every rule below before use.** These are starting points for engineering, not legal conclusions. Immigration law has many exceptions (for example INA 245(i), immediate-relative overstay rules, waivers, TPS, parole).

Starter rules to implement as placeholders with `verified: false`:

| Rule id | Purpose | Starting logic (to verify) | Citation to check |
| --- | --- | --- | --- |
| `entry.inspected` | Was the person inspected and admitted or paroled? | last_entry_manner in (visa, vwp, parole) | INA 245(a) |
| `bar.unlawful_presence_3y` | 3-year bar flag | unlawful presence over 180 days and under 1 year, then departed | INA 212(a)(9)(B)(i)(I) |
| `bar.unlawful_presence_10y` | 10-year bar flag | unlawful presence of 1 year or more, then departed | INA 212(a)(9)(B)(i)(II) |
| `bar.permanent` | Permanent bar flag | over 1 year unlawful presence or prior removal, then re-entry or attempted re-entry without inspection | INA 212(a)(9)(C) |
| `asylum.one_year` | One-year filing deadline | arrival date + 1 year vs today; flag exceptions for attorney | INA 208(a)(2)(B), (D) |
| `cspa.age_out` | Child age-out risk | child age near 21; compute CSPA age for attorney | INA 203(h) |
| `n400.residence` | Naturalization residence | LPR 5 years, or 3 years if married to and living with a USC | INA 316(a), 319(a) |
| `n400.early_filing` | Early filing window | 90 days before the residence date | INA 334(a) |
| `deadline.rfe` | RFE response date | from notice date + response period on the notice | Notice itself |
| `flag.criminal` | Any arrest, charge or conviction | any red_flags.arrests_charges_convictions | Attorney review |
| `flag.prior_removal` | Prior removal or order | history.prior_court_or_removal | Attorney review |

Rules output: `redFlags`, `deadlines`, `pathwayHints`. The LLM may explain these outputs in plain language but may not override them.

Every rule needs unit tests with fixtures, and the rules package exports a `RULES_VERSION` stamped on every assessment.

---

## 9. Agent orchestrator

A state machine (XState or a hand-written reducer). States:

```
start -> disclosures -> triage
triage -> escalate            (any urgent flag)
triage -> identify            (no urgent flag)
identify -> existing_client   (verified by OTP or app session)
identify -> new_intake
existing_client -> answer_from_file | legal_question | doc_request | booking
new_intake -> goal -> core -> history -> module -> red_flags -> documents -> playback
playback -> assessment_pending -> booking -> end
legal_question -> review_queue -> end
escalate -> live_transfer | on_call_alert -> end
```

LLM tools available to the agent (each tool validated by zod, logged, permission-checked):

- `getCaseFacts(personId)`: cases, dates, steps, missing documents (read-only, from CRM).
- `saveIntakeField(intakeId, module, field, value, confidence)`
- `runRules(intakeId)`: returns rules output.
- `classifyQuestion(text)`: `fact | general_info | legal_question | urgent`.
- `createReviewItem(...)`
- `explainDocument(documentId, lang)`: returns a plain-language summary with the disclaimer.
- `bookConsult(personId, slot, mode)`
- `sendUploadLink(personId, items)`
- `escalate(personId, flags)`

System prompt rules for the LLM (put in `packages/agent/prompts/system.md`, reviewed by the attorney):

- You are the Chhetry Law assistant. You are an AI and say so.
- Answer only from tool results for case facts. If not in the file, say you will ask the team.
- If a question needs legal judgment, call `classifyQuestion`, then `createReviewItem`, and tell the client their attorney will answer.
- Never promise outcomes. Never advise leaving the US, skipping hearings, or self-filing.
- Speak in the client's language. Keep sentences short. Offer to read aloud.

---

## 10. Guardrails package

- **Input classifier:** labels each user turn `fact | general_info | legal_question | urgent | off_topic`. Start with the LLM plus keyword rules (travel, eligible, qualify, should I, can I, deport, arrest, ICE, detained, hearing tomorrow). Add a labeled test set in en/ne/bn.
- **Output checker:** before any client-facing message, block or rewrite outputs that contain outcome promises, advice verbs on restricted topics, or missing disclaimers. Log every block.
- **Escalation checker:** any urgent keyword in any language forces the escalate path.

Target metrics in CI: zero outcome promises on the red-team set; 100% of urgent fixtures escalate.

---

## 11. CRM adapter

```ts
export interface CrmAdapter {
  findPerson(query: { phone?: string; email?: string; aNumber?: string }): Promise<Person | null>;
  upsertPerson(p: Partial<Person>): Promise<Person>;
  getCases(personId: string): Promise<CaseSummary[]>;
  getDocuments(personId: string): Promise<DocumentRef[]>;
  createMatter(personId: string, goal: Goal): Promise<{ matterId: string }>;
  writeIntake(matterId: string, intake: IntakeRecord): Promise<void>;
  attachTranscript(matterId: string, ref: string, summary: string): Promise<void>;
  createTask(matterId: string, task: { title: string; due?: string; assignee?: string }): Promise<void>;
}
```

Build `MockCrmAdapter` first with seed data matching the prototype (Sharma family: Sita's removal case and I-130 RFE, Ram's I-485 interview and approved I-765). Then build the real adapter for the firm's CRM.

---

## 12. API endpoints (first pass)

```
POST /v1/voice/sessions                 start a voice session (channel, lang) -> session token
WS   /v1/voice/sessions/:id/stream      audio in/out, events
POST /v1/conversations/:id/disclosures  accept disclosures
GET  /v1/me/cases                       client's cases (app)
POST /v1/questions                      text or transcribed question -> answer or review item
GET  /v1/documents/:id/explain?lang=    plain-language explanation
POST /v1/intake/:id/fields              save field
POST /v1/intake/:id/assess              run rules + draft assessment -> review queue
GET  /v1/review                         attorney queue
POST /v1/review/:id/decision            approve | edit_send | call_client | reject
POST /v1/bookings                       book consult (Stripe payment intent)
POST /v1/escalations                    urgent escalation
POST /v1/telephony/twilio/inbound       phone entry point
```

All endpoints: auth, role check, audit log, PII-safe logging.

---

## 13. Security checklist (build in from day one)

- [ ] Field-level encryption for A-number, criminal history, persecution details, status
- [ ] Encryption at rest and in transit
- [ ] Role-based access (client, staff, attorney, management, admin, super admin)
- [ ] Audit log table, append-only
- [ ] PII-safe logger (redacts by field name and pattern)
- [ ] Retention job for non-client intake data
- [ ] Vendor config enforces no-training and US region
- [ ] Secrets in a secret manager, never in the repo
- [ ] Dependency and container scanning in CI

---

## 14. Milestones and first tasks

### Milestone 0: Foundations (week 1 to 2)
- [ ] Scaffold monorepo per section 5
- [ ] Prisma schema for Person, Conversation, IntakeRecord, Assessment, ReviewItem, AuditLog
- [ ] PII-safe logger and encryption helpers with tests
- [ ] `MockCrmAdapter` with prototype seed data
- [ ] i18n package with en, ne, bn and the disclaimer strings

### Milestone 1: Text-first agent (week 3 to 5)
Build the whole flow with text before adding voice. It is faster to test.
- [x] Intake schema for triage, core, history, family, removal
- [x] Orchestrator state machine with tests for every transition
- [x] Guardrails classifier and output checker with red-team fixtures
- [x] Rules engine with the starter rules (`verified: false`) and tests
- [x] Ask-from-file answers using `getCaseFacts`
- [x] Review queue API + minimal attorney console

### Milestone 2: Voice (week 6 to 8)
- [ ] Voice adapter interface + first provider
- [ ] In-app "Ask by voice" screen wired to the agent
- [ ] Language detection and switching (en, ne, bn)
- [ ] Read-aloud for answers and document explanations
- [ ] Twilio inbound line on the same agent

### Milestone 3: Consultation features (week 9 to 10)
- [ ] Explain this letter
- [ ] Document request + upload link + blur check
- [ ] Consult booking + Stripe payment
- [ ] Client Plus gating (Ask by voice, explainer, interview practice)

### Milestone 4: Pilot readiness
- [ ] Attorney verifies all rules and scripts (flip `verified: true`)
- [ ] Ethics counsel sign-off on disclosures and review gate
- [ ] Security review
- [ ] Management dashboard: app users, calls avoided, Client Plus conversion, tracker funnel, reply time

---

## 15. Conventions

- TypeScript strict, no `any` in packages.
- zod for all external input and LLM tool arguments.
- Every user-facing string goes through i18n; no hardcoded English in components.
- Tests: Vitest for packages, Playwright or Detox for app flows.
- Each rule, guardrail and state transition has a test.
- Small PRs with a short description of what changed and which guardrail it touches.
- Write an ADR in `docs/decisions/` for every vendor or architecture choice.

---

## 16. Open decisions (ask before assuming)

1. Which CRM API and auth method do we integrate with?
2. Voice provider for the first adapter?
3. Is the existing mobile app Expo/React Native, or something else?
4. Is the first consult paid at booking or free?
5. What may the agent say about fees and timelines?
6. Which attorney owns rules and scripts?

---

## 17. First prompt to give Claude Code

> Read CLAUDE.md. Scaffold Milestone 0: the monorepo layout in section 5, the Prisma schema from section 6, the PII-safe logger and encryption helpers with tests, the MockCrmAdapter with the Sharma family seed data, and the i18n package with en, ne and bn disclaimer strings. Ask me about any open decision in section 16 before choosing.
