# Voice provider test plan: Nepali, Bengali and English

Status: draft for review
Owner: engineering (test harness and objective metrics); native-speaker panel (subjective scores); supervising attorney (vocabulary and script sign-off)
Decision it feeds: the first voice adapter for Milestone 2, recorded as an ADR in `docs/decisions/`

Anything marked **[Assumption]** is a guess to confirm before testing starts. Anything marked **[Firm decision]** was answered by the firm on 2026-11-27. Items still to be filled in are listed in section 14. Vendor capabilities listed here are **not verified**; Gate 0 exists to check them.

---

## 1. Goal

Pick the first voice provider for the Chhetry Law voice layer, mainly on how well it **understands and speaks Nepali and Bengali**, with English as a baseline. The provider has to pass the spec's must-haves (no training on our data, US region) before its quality counts.

**[Firm decision]** Launch order: the **app first** ("Ask by voice" for existing, signed-in clients, answering from their own file), **then the phone line**. The scoring in this plan weights app audio and app latency above phone-line results to match. Phone-line tests still run, so we know early whether the same provider can serve the phone line later.

We are choosing a provider for the first adapter only. All voice code goes through the provider-neutral `VoiceAdapter` interface, so this choice can be changed later.

## 2. Candidates

| Candidate | Type | How we test it |
| --- | --- | --- |
| OpenAI Realtime | Speech-to-speech model | Direct API, its built-in voices |
| ElevenLabs Agents | Agent platform with its own STT and TTS | Direct, best multilingual voice per language |
| Vapi | Orchestration platform (you plug in STT, LLM, TTS) | Test the best STT and TTS pairing it offers for each language |
| Retell | Orchestration platform (you plug in STT, LLM, TTS) | Same as Vapi |

Reference baselines, for STT and TTS only (not full agents):

| Baseline | Why include it |
| --- | --- |
| Google Cloud Speech-to-Text and TTS | Long-standing Nepali and Bengali support. Can sit behind Vapi or Retell, or behind our own adapter. |
| Azure AI Speech | Has Nepali and Bengali neural voices, and US-region and no-training terms are common in its enterprise contracts. |

**[Assumption]** Vapi and Retell are judged by the best STT and TTS engines they can route to. If the best engine for Nepali is a sub-vendor (for example Google or Azure), that sub-vendor must also pass Gate 0.

**[Assumption]** Including the two baselines is worth the extra day. They tell us whether a weak Nepali or Bengali result is the platform's fault or a limit of current speech tech. Drop them if time is short.

The LLM is held constant (Claude, per the spec) wherever the platform lets us bring our own model, so we compare speech, not reasoning. OpenAI Realtime is speech-to-speech, so its reasoning cannot be separated; we judge its transcripts and audio only, and note this in the results.

## 3. Gate 0: must-haves (pass or fail, before any quality testing)

A candidate that fails any line here is dropped, whatever its quality. Get each answer in writing (contract, DPA, or vendor docs page), and record the link. For Vapi and Retell, every sub-vendor in the call path (STT, TTS, telephony) must pass too.

### Product and platform

| # | Requirement | Evidence to collect |
| --- | --- | --- |
| G1 | No training on our audio, transcripts or outputs, by default or by contract | DPA or enterprise terms clause |
| G2 | Data processed and stored in the US, including every sub-vendor in the call path | Data residency statement, subprocessor list |
| G3 | We control recording: recording can be off until consent, per the disclosure flow | API flag or setting |
| G4 | Supports Nepali and Bengali in both STT and TTS (not only one) | Language list, plus a 1-minute live check |
| G5 | Works with Twilio for the phone line (SIP or media streams). Needed for the phone phase, not the app launch | Docs, plus a working test call |

### Ethics counsel vendor checklist

**[Firm decision]** Ethics counsel will review each vendor against the items below, and each one is pass or fail in this gate. This is a checklist to bring to counsel, not legal advice; counsel may add to it.

| # | Requirement | Evidence to collect |
| --- | --- | --- |
| E1 | A data processing agreement (DPA) that confirms no training on our data **and** no human review of our audio by vendor staff, or a way to opt out of human review | Signed or signable DPA |
| E2 | Retention and deletion: how long audio and transcripts are kept, we can set short or zero retention, and we can delete on request | DPA clause, settings page, deletion API or process |
| E3 | Subprocessor list (the other companies that handle our data), with notice before that list changes | Published list, notice clause |
| E4 | Encryption in transit and at rest, plus access logging of who at the vendor touches our data | Security docs or trust page |
| E5 | Security attestation: SOC 2 Type II or ISO 27001 | Current report or certificate |
| E6 | Breach notification terms with a stated time limit | Contract clause |
| E7 | Confidentiality terms strong enough for the duty of confidentiality (ABA Model Rule 1.6), supporting the vendor due diligence described in ABA Formal Opinion 512 | Contract clause, counsel's review notes |
| E8 | Support for playing a recording disclosure and capturing consent before recording starts | API feature, plus a working test |
| E9 | Indemnity and liability terms for data incidents | Contract clause |

**[Assumption]** HIPAA BAA is not required, since this is legal and not health data. Counsel can override this.

## 4. What we measure

1. STT accuracy, overall and on immigration vocabulary
2. TTS naturalness and intelligibility
3. Latency
4. Language detection and switching
5. Phone-line audio quality (8 kHz, noise)
6. Urgent-term recall (safety)
7. Cost per minute (tie-breaker)

## 5. Speakers and recording conditions

### Speakers

| Language | Speakers | Mix |
| --- | --- | --- |
| Nepali | 6 to 8 | Mixed gender; at least 2 aged 55+; Kathmandu-valley and Terai or hill accents |
| Bengali | 6 to 8 | Mixed gender; at least 2 aged 55+; Bangladeshi (Dhaka and Sylheti-influenced) and West Bengal accents |
| English | 4 | At least 2 non-native speakers with South Asian accents |
| Sylheti (conditional) | 3 to 4 | Only if the language-share count (section 14) shows Sylheti is significant |

**[Assumption]** Most Bengali-speaking clients are from Bangladesh, so Bangladeshi Bengali gets more weight. This stays an assumption until the language-share count in section 14 comes back.

**Sylheti (conditional test language).** Sylheti is often treated as a dialect of Bengali, but speech recognition usually handles it poorly, and most engines do not list it at all. If the language-share count shows a significant share of Sylheti-speaking clients:

- Add a Sylheti set: the A1, A2 and A6 groups of Set A, plus B2 and B3 from Set B, recorded by Sylheti speakers.
- Report Sylheti results separately. They do not count toward the Bengali score, so a weak Sylheti result does not sink an otherwise good Bengali provider.
- Apply the urgent-term threshold (section 9) to Sylheti too. If no provider passes it, launch with a **human fallback** for Sylheti: the agent detects Sylheti (or the caller picks it) and routes to a staff member or a callback, instead of running voice intake or answers.
- If the count shows Sylheti is rare, skip the set and note the gap in the ADR.

**[Assumption]** Speakers are firm staff, their families, or paid community volunteers. They read scripts with fake personas only. No real client audio or data is used in any test.

### Conditions

Each speaker records every STT script in these conditions. App conditions (C1, C2) carry more weight in scoring than phone conditions (C3, C4), because the app launches first.

| Code | Channel | Setup |
| --- | --- | --- |
| C1 | App, quiet | Phone mic, quiet room, 16 kHz or better |
| C2 | App, noisy | Phone mic, kitchen or street noise, TV in background |
| C3 | Phone line | Real call through Twilio to the test number (8 kHz, narrowband codec) |
| C4 | Speakerphone | Phone line, speaker mode, about 1 m away |

To keep the comparison fair, record each utterance once per condition and replay the **same audio files** to every provider's STT. Live calls (section 8) are added on top for latency and turn-taking, which recordings cannot test.

## 6. Test scripts

All scripts are written first in English by engineering, then translated and checked by native speakers, then reviewed by the supervising attorney for correct immigration terms. Store them in `docs/scripts/voice-eval/` with a version number.

**[Assumption]** We let speakers use natural code-mixing: Nepali and Bengali speakers in the US often say "green card", "court date", "lawyer", "interview" and form numbers in English inside a native sentence. Scripts should include it on purpose, because real calls will.

### Set A: read sentences for STT (about 60 per language)

Each sentence has a reference transcript and a list of key terms that must come out right.

| Group | Count | Examples (English source) |
| --- | --- | --- |
| A1 Everyday intake | 10 | "My name is Sita Sharma and I live in Queens, New York." |
| A2 Immigration terms | 15 | "I got a Request for Evidence for my I-130." "My husband has a green card, not citizenship." "I came on a B-2 visitor visa." "I have a work permit, the I-765 was approved." |
| A3 Numbers and IDs | 10 | "My A-number is 2 0 1 4 5 6 7 8 9." "The receipt number is IOE 0912345678." Phone numbers, ZIP codes |
| A4 Dates | 8 | "My hearing is on March 3rd, 2027." Spoken in native style too, for example day then month, and Nepali Bikram Sambat dates if speakers use them |
| A5 Names and places | 7 | Nepali and Bengali personal names, home districts (Jhapa, Sylhet, Chittagong), US cities and courts (26 Federal Plaza) |
| A6 Urgent triage | 10 | "ICE came to my house this morning." "My brother was detained yesterday." "My court hearing is in three days." "I got a deportation order." "I am afraid for my life." |

**[Assumption]** The A-number and receipt-number formats above are illustrative. Use made-up IDs that follow real formats; never real ones.

### Set B: role-play conversations (live, section 8)

Each speaker does 4 short scripted role-plays with the test agent. The agent follows a fixed script so all providers hear the same prompts.

| Script | Flow it mirrors | What it stresses |
| --- | --- | --- |
| B1 New-client intake | disclosures → triage → goal → core questions | Long answers, names, dates, consent "yes" or "no" |
| B2 Urgent escalation | disclosures → triage with "my hearing is tomorrow" | Must detect the urgent term and stop intake |
| B3 Ask from file (the launch use case) | "When is my interview?" "Did my work permit get approved?" | Short questions, case terms |
| B4 Language switch | Start in English, switch to Nepali or Bengali mid-call, then mix | Detection speed, no broken replies |

### Set C: TTS prompts (about 25 per language)

| Group | Examples |
| --- | --- |
| C1 Disclosures | AI disclosure, recording consent, "general information; an attorney will review", confidentiality (from the i18n package, once translated) |
| C2 Label | "Facts from your file only, not legal advice" |
| C3 Letter explanation | A 60 to 90 second plain-language explanation of a sample RFE or hearing notice |
| C4 Numbers and dates | Dates, times, A-number read back with masking ("ending in 7 8 9"), dollar amounts |
| C5 Terms | Form numbers (I-130, I-485, N-400), "USCIS", "EOIR", "Immigration Court", English loanwords inside native sentences |
| C6 Empathy | "I understand. This sounds stressful. I am connecting you to our team now." |

Use each provider's best available voice per language, one female and one male where offered.

## 7. Metrics and how to compute them

### STT

| Metric | How | Notes |
| --- | --- | --- |
| CER (character error rate) | Against reference, after normalising punctuation and digits | Main metric for Nepali and Bengali, because word boundaries and spelling vary |
| WER (word error rate) | Same | Main metric for English; reported for all |
| Key-term accuracy | Share of tagged key terms (form numbers, statuses, names, IDs, dates) transcribed correctly | Scored by a native speaker plus script check |
| Number and date exact match | Share of A3 and A4 items fully correct | One wrong digit is a fail |
| Urgent-term recall | Share of A6 items where the urgent meaning survives in the transcript | **Safety metric.** Judged by a native speaker: would our classifier see "detained", "hearing in 3 days", etc.? |
| Script correctness | Output is in Devanagari for Nepali and Bengali script for Bengali (or consistent romanisation if that is what the provider returns) | Mixed or wrong script causes downstream errors |

Report each metric per language and per condition (C1 to C4).

### TTS

| Metric | How |
| --- | --- |
| Naturalness MOS | 1 to 5 scale per clip, blind (provider names hidden, order randomised) |
| Intelligibility | Listener writes down what they heard for 10 clips; score by CER against the script |
| Pronunciation of terms | Per clip, yes or no: form numbers, "USCIS", names, loanwords pronounced acceptably |
| Numbers and dates | Yes or no per item: read correctly and in a natural way for that language |
| Preference | For C3 (long explanation), listeners rank the providers' versions |
| Phone-line clarity | Same C3 and C4 clips played over a real call, rated 1 to 5 |

### Latency (live calls)

| Metric | Target |
| --- | --- |
| End of user speech to first agent audio, p50 | under 1.2 s **[Assumption]** |
| Same, p95 | under 2.5 s **[Assumption]** |
| Barge-in: user speaks over agent, agent stops | under 0.5 s |
| False end-of-turn (agent cuts the user off mid-answer) | under 5% of turns; older speakers pause more, so check them separately |

Measure on the app channel and on the phone line, from a US-East client. Keep the LLM and agent logic the same across providers, and subtract LLM time where the platform reports it, so we compare speech latency.

### Language detection and switching

| Metric | How |
| --- | --- |
| First-utterance detection | Share of calls where the language is correctly detected from the first answer |
| Switch detection | In B4, number of turns until the agent replies in the new language (target: 1) |
| Code-mix handling | Mixed sentences are transcribed in the right scripts and not forced into English |
| Wrong-language replies | Count of agent replies in the wrong language (target: 0) |

**[Assumption]** If a provider cannot auto-detect Nepali or Bengali, we can still pass it by having the caller pick a language at the start (app setting, or "press 2 for Nepali" on the phone). Detection is then a smaller weight, but switching mid-call should still work or fail gracefully.

## 8. Live call protocol

1. For each provider, build the same small test agent with a fixed script (B1 to B4) and Claude as the LLM where possible.
2. Connect it to a Twilio test number and to a minimal app test page.
3. Each speaker does B1 to B4 once per provider on the app. B2 and B3 are also done on the phone line, to check the later phone phase (order of providers randomised per speaker to avoid fatigue bias).
4. Log timestamps for every turn (user speech end, first audio out) and save transcripts for scoring.
5. After each call, the speaker answers three questions (1 to 5): "Did it understand you?", "Was it easy to talk to?", "Would your parents be comfortable using it?"

Use the provider-neutral `VoiceAdapter` interface from Milestone 0 for the harness where it fits, so the winning adapter is partly built by the end of the test. **[Assumption]** A thin per-provider adapter is acceptable throwaway code if the interface is not ready.

## 9. Scoring rubric

Scores are 0 to 5 per area, from the metrics above. Weights reflect that Nepali and Bengali are the reason for this test.

| Area | Weight | Score 5 looks like | Score 1 looks like |
| --- | --- | --- | --- |
| Nepali STT (CER, key terms) | 20% | Few errors, key terms right | Frequent errors, IDs and terms garbled |
| Bengali STT | 20% | As above | As above |
| Nepali TTS (MOS, pronunciation) | 10% | Sounds natural, terms and numbers right | Robotic or mispronounces common terms |
| Bengali TTS | 10% | As above | As above |
| Latency and turn-taking on the app | 15% | Meets targets | p95 over 4 s, frequent cut-offs |
| Language detection and switching | 10% | Detects and switches in one turn | Replies in the wrong language |
| Phone-line readiness (STT on C3 and C4, phone latency, Twilio fit) | 5% | Small drop from app results, Twilio works cleanly | Large drop, or Twilio setup is fragile |
| English quality | 5% | Strong on accented English | Struggles with South Asian accents |
| Cost per minute against the cap | 5% | Well inside the cap | Over the cap |

**App weighting.** Inside each STT and TTS row, app conditions (C1, C2) count for 75% and phone conditions (C3, C4) for 25%. **[Assumption]** on the 75/25 split; it follows the app-first launch order.

### Cost cap

**[Firm decision, to confirm with the partners]** Target **$0.15 to $0.25 per minute, all-in** for app questions ("Ask by voice"). All-in means speech-to-text, the AI model, text-to-speech and, where used, telephony.

- Where it comes from: Client Plus is $12.99 a month. At about 20 minutes of talk per active user per month, voice costs must stay well under about $0.65 a minute to leave any margin.
- New-client intake calls can justify a higher cap, since one retained case is worth far more than the call. **The intake cap is not set yet** (section 14).
- How it is scored: a provider within $0.15 to $0.25 scores 3 to 5; over $0.25 scores 1 or 2 and is flagged in the ADR. It is not a hard fail until the partners confirm the cap.
- Compute cost at expected volume, using each vendor's quoted price, and include the LLM cost even where it is billed separately.

**Hard thresholds** (a provider fails, whatever its total):

- Urgent-term recall below 100% on clean audio (C1) or below 95% on phone audio (C3), in any language. **[Assumption]** on the 95%; the guardrail spec requires that all urgent fixtures escalate, and the escalation checker can only see what STT gives it.
- Number and date exact match below 90% on C1 in any language.
- Any Gate 0 failure.

**Splitting providers:** if one provider wins on STT and another on TTS, we may pick a combination (through Vapi, Retell, or our own adapter) as long as every part passes Gate 0. Note the extra latency of a chained setup.

## 10. Who scores

| Role | People | What they score |
| --- | --- | --- |
| Native-speaker panel, Nepali | 3 listeners, not the same people who recorded | TTS MOS, intelligibility, pronunciation; key-term and urgent-term judgements on STT output |
| Native-speaker panel, Bengali | 3 listeners, including at least 1 Bangladeshi | Same |
| English listeners | 2 | Same for English |
| Supervising attorney (or attorney-designated paralegal) | 1 | Signs off the scripts; reviews key-term errors that could change legal meaning (for example "citizen" vs "green card holder") |
| Ethics counsel | 1 | Reviews Gate 0 vendor evidence against E1 to E9; pass or fail per vendor |
| Engineer | 1 | CER, WER, latency, detection metrics, Gate 0 evidence, cost |
| Product owner (ASMIT) | 1 | Collects scores, runs the final weighting, writes the ADR |

Scoring rules:

- Listeners score blind: provider names hidden, clip order randomised.
- Each listener scores every clip for their language. Use the median across listeners.
- Check agreement on a 10-clip overlap set; if listeners disagree by 2 or more points on many clips, hold a short calibration session and rescore.
- **[Assumption]** Bilingual firm staff can serve as listeners; if the panel is mostly staff, add at least one outside listener per language who matches the client profile (older, less English).

## 11. Data handling during the test

- Fake personas and made-up IDs only. No real client names, A-numbers or case facts.
- Use each vendor's no-training and lowest-retention settings even for test data.
- Recordings and transcripts stay in the firm's US-region storage, with access limited to the test team; delete vendor-side copies after scoring.
- Speakers sign a short consent form for the recordings.

## 12. Timeline (about 3 weeks, alongside Milestone 1)

| Week | Work |
| --- | --- |
| 1 | Gate 0 paperwork with each vendor; write English scripts; recruit speakers and listeners |
| 1 to 2 | Translate and attorney-review scripts; record Set A in C1 to C4; build test agents |
| 2 | Run batch STT on all providers; generate Set C TTS clips |
| 2 to 3 | Live calls (Set B); listener scoring sessions |
| 3 | Compile results, apply rubric, write the ADR |

**[Assumption]** Vendor trial or sales accounts can be set up within week 1. Enterprise terms (G1, G2 and E1 to E9) may take longer, and ethics counsel needs time to review them; start those conversations first.

## 13. Output

1. A results sheet: per provider, per language, per condition, with the raw metrics and listener scores.
2. An ADR in `docs/decisions/` naming the first provider, the runner-up, the scores, Gate 0 evidence links, and known weak spots (for example "Sylheti not supported").
3. Saved test set (scripts, reference transcripts, audio) reused as a regression suite whenever we change provider or model.

## 14. Open items for the firm

### Still needed

1. **Language share.** Approximate share of clients who speak Nepali, Bangladeshi Bengali, Indian Bengali, Sylheti, English and other languages.
   - Where to get it: the CRM's preferred-language field, or a count of the last 6 to 12 months of intakes. The front desk can also estimate from call volume.
   - Why it matters: it sets the Bengali dialect weighting, and decides whether the Sylheti set and the Sylheti human fallback (section 5) are needed.
2. **Testers.** At least two native speakers per language: one to record test calls, one to score them independently (section 10 asks for three listeners where possible).
   - The prototype lists a paralegal who speaks Nepali and English. Bengali speakers still need to be found, and a Sylheti speaker if that group is significant.
   - If staff don't have the time, a paid freelance native speaker for a week of scoring works too.
   - Names: not yet given.
3. **Intake cost cap.** Maximum per-minute cost for new-client intake calls: not yet set.
4. **Partner sign-off** on the $0.15 to $0.25 per minute app cap.
5. **Ethics counsel** review of vendors against the E1 to E9 checklist (section 3), and any items counsel wants to add.

### Decided (2026-11-27)

- Launch order: app first ("Ask by voice" for existing clients), then the phone line.
- App cost target: $0.15 to $0.25 per minute all-in, pending partner confirmation.
- Ethics counsel vendor checklist added to Gate 0 as pass or fail criteria.
- Sylheti is a conditional test language, with a human fallback if no provider handles it.
