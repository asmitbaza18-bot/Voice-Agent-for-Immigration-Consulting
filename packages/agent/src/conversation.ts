import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  AgentState, Assessment, Channel, Conversation, FieldValue, Goal, IntakeRecord, Lang, Logger, ModuleId, Person, UrgentFlag,
} from '@chhetry/shared';
import { ENCRYPTED_COLUMNS, encryptField, normalizeANumber, type AuditSink, type KeyRing } from '@chhetry/db';
import type { CrmAdapter } from '@chhetry/crm';
import { checkEscalation, enforceOutput, type LlmLabeler } from '@chhetry/guardrails';
import { DISCLOSURES_VERSION, disclosures, t } from '@chhetry/i18n';
import {
  GOAL_OPTIONS, GOAL_PROMPT, MODULES, formatAnswer, getQuestion, isIntakeModuleId, missingRequired, moduleForGoal, nextQuestion,
  validateAnswer, type IntakeModuleId, type Question,
} from '@chhetry/intake-schema';
import { computeUrgentFlags, type RulesOutput } from '@chhetry/rules';
import { factDates, templateAnswer, type CaseFacts } from './case-facts.js';
import type { EscalationService } from './escalation.js';
import type { LlmAdapter } from './llm.js';
import { transition, type AgentEvent } from './machine.js';
import { NEEDS_ATTORNEY, NOT_IN_FILE, PROMPT_VERSION, SYSTEM_PROMPT } from './prompts.js';
import type { ReviewQueue } from './review-queue.js';
import { invokeTool, type Actor, type IntakeFieldStore, type ToolCall, type ToolDeps } from './tools.js';

/**
 * Text-first orchestrator (Milestone 1). Drives the state machine from typed
 * user actions. Rules decide, code routes, the LLM only writes answer text.
 *
 * Every client-facing message passes enforceOutput (guardrails 2, 3, 4, 7).
 * Every user text is checked for urgent keywords first (guardrail 5).
 */

export interface QuestionView {
  module: IntakeModuleId | 'goal';
  id: string;
  prompt: string;
  type: Question['type'];
  options?: { value: string; label: string }[];
  required: boolean;
  sensitive: boolean;
  allowDiscussWithAttorney: boolean;
}

export interface TurnResult {
  conversationId: string;
  state: AgentState;
  messages: string[];
  question: QuestionView | null;
  /** Lines read back to the caller before they confirm (state 'playback'). */
  playback?: string[];
  reviewItemId?: string;
  escalation?: { id: string; mode: 'live_transfer' | 'on_call_alert'; flags: UrgentFlag[] };
}

interface IntakeState {
  id: string;
  goal?: Goal;
  modules: Partial<Record<ModuleId, Record<string, FieldValue>>>;
  skipped: Partial<Record<ModuleId, string[]>>;
  uncertain: string[];
  discuss: string[];
  /** Legal questions asked by a new caller before they have a CRM record. */
  pendingQuestions: string[];
}

interface ConversationRecord {
  conversation: Conversation;
  tokenHash: Buffer;
  /** Person id from an authenticated app session (guardrail: existing client verified by app session or OTP). */
  verifiedPersonId?: string;
  intake: IntakeState;
}

export interface ConversationDeps {
  crm: CrmAdapter;
  reviewQueue: ReviewQueue;
  escalations: EscalationService;
  audit: AuditSink;
  logger: Logger;
  keyRing: KeyRing;
  llm?: LlmAdapter;
  llmLabeler?: LlmLabeler;
  /** 'YYYY-MM-DD' in the firm's time zone. Injected for reproducible rules. */
  today: () => string;
  now?: () => Date;
}

export class ConversationError extends Error {
  override name = 'ConversationError';
  constructor(message: string, readonly code: 'not_found' | 'bad_state' | 'invalid' | 'forbidden') {
    super(message);
  }
}

const hashToken = (tok: string) => createHash('sha256').update(tok).digest();

const STATE_MODULE: Partial<Record<AgentState, 'triage' | 'core' | 'history' | 'module'>> = {
  triage: 'triage', core: 'core', history: 'history', module: 'module',
};

export class ConversationService implements IntakeFieldStore {
  private readonly records = new Map<string, ConversationRecord>();
  private readonly assessments = new Map<string, Assessment>();
  private readonly tools: ToolDeps;

  constructor(private readonly deps: ConversationDeps) {
    this.tools = {
      crm: deps.crm, intakes: this, reviewQueue: deps.reviewQueue, escalations: deps.escalations,
      audit: deps.audit, logger: deps.logger, today: deps.today,
      ...(deps.llmLabeler ? { llmLabeler: deps.llmLabeler } : {}),
    };
  }

  // ---------- IntakeFieldStore ----------

  intakeBelongsTo(intakeId: string, conversationId: string): boolean {
    return this.records.get(conversationId)?.intake.id === intakeId;
  }

  saveField(intakeId: string, module: string, field: string, value: FieldValue, confidence: 'confirmed' | 'unsure'): void {
    const rec = [...this.records.values()].find((r) => r.intake.id === intakeId);
    if (!rec) throw new ConversationError('Intake not found', 'not_found');
    const m = module as ModuleId;
    (rec.intake.modules[m] ??= {})[field] = value;
    const key = `${module}.${field}`;
    rec.intake.uncertain = rec.intake.uncertain.filter((k) => k !== key);
    rec.intake.discuss = rec.intake.discuss.filter((k) => k !== key);
    if (confidence === 'unsure') rec.intake.uncertain.push(key);
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'discuss_with_attorney') rec.intake.discuss.push(key);
  }

  // ---------- lifecycle ----------

  async start(input: { channel: Channel; lang: Lang; verifiedPersonId?: string }): Promise<{ token: string; turn: TurnResult }> {
    const token = randomBytes(32).toString('base64url');
    const conversation: Conversation = {
      id: `conv_${randomUUID()}`,
      channel: input.channel,
      lang: input.lang,
      startedAt: (this.deps.now ?? (() => new Date()))().toISOString(),
      disclosuresAccepted: false,
      recordingConsent: false,
      urgentFlags: [],
      state: 'start',
      transcriptRef: '',
    };
    const rec: ConversationRecord = {
      conversation, tokenHash: hashToken(token),
      intake: { id: `int_${randomUUID()}`, modules: {}, skipped: {}, uncertain: [], discuss: [], pendingQuestions: [] },
    };
    if (input.verifiedPersonId) rec.verifiedPersonId = input.verifiedPersonId;
    this.records.set(conversation.id, rec);
    this.move(rec, 'START');
    this.deps.audit.write({ actorType: 'system', action: 'conversation.start', entityType: 'Conversation', entityId: conversation.id, metadata: { channel: input.channel, lang: input.lang, disclosuresVersion: DISCLOSURES_VERSION } });
    // Guardrail 6: disclosures open every conversation.
    return { token, turn: this.turn(rec, disclosures(input.lang).map((d) => d.text)) };
  }

  /** Constant-time check of the conversation token issued by start(). */
  verifyToken(conversationId: string, token: string): boolean {
    const rec = this.records.get(conversationId);
    if (!rec) return false;
    const h = hashToken(token);
    return h.length === rec.tokenHash.length && timingSafeEqual(h, rec.tokenHash);
  }

  get(conversationId: string): Conversation {
    return structuredClone(this.rec(conversationId).conversation);
  }

  getAssessment(id: string): Assessment | undefined {
    const a = this.assessments.get(id);
    return a ? structuredClone(a) : undefined;
  }

  async acceptDisclosures(id: string, a: { aiDisclosureAck: boolean; recordingConsent: boolean; infoNotAdviceAck: boolean }): Promise<TurnResult> {
    const rec = this.rec(id);
    this.requireState(rec, 'disclosures');
    const lang = rec.conversation.lang;
    if (!a.aiDisclosureAck || !a.infoNotAdviceAck) {
      this.move(rec, 'DISCLOSURES_DECLINED');
      return this.turn(rec, [t(lang, 'agent.disclosures_declined')]);
    }
    rec.conversation.disclosuresAccepted = true;
    // Declining recording does not end the conversation; transcripts are then not kept.
    rec.conversation.recordingConsent = a.recordingConsent;
    this.deps.audit.write({ actorType: 'user', action: 'conversation.disclosures_accepted', entityType: 'Conversation', entityId: id, metadata: { recordingConsent: a.recordingConsent, disclosuresVersion: DISCLOSURES_VERSION } });
    this.move(rec, 'DISCLOSURES_ACCEPTED');
    return this.advance(rec, []);
  }

  async answer(id: string, a: { module: string; field: string; value: unknown; unsure?: boolean }): Promise<TurnResult> {
    const rec = this.rec(id);
    const module = this.currentModule(rec);
    if (!module || module !== a.module) throw new ConversationError(`Not collecting ${a.module} now`, 'bad_state');
    const q = getQuestion(module, a.field);
    if (!q) throw new ConversationError(`Unknown field ${a.module}.${a.field}`, 'invalid');

    // Guardrail 5: urgent words inside a typed answer also escalate.
    const urgentText = this.urgentIn(a.value);
    if (urgentText) return this.escalateNow(rec, urgentText.flags, urgentText.matchedPatterns);

    await this.save(rec, q, a.value, a.unsure ? 'unsure' : 'confirmed');
    return this.advance(rec, []);
  }

  async skip(id: string, a: { module: string; field: string }): Promise<TurnResult> {
    const rec = this.rec(id);
    const module = this.currentModule(rec);
    if (!module || module !== a.module) throw new ConversationError(`Not collecting ${a.module} now`, 'bad_state');
    const q = getQuestion(module, a.field);
    if (!q) throw new ConversationError(`Unknown field ${a.module}.${a.field}`, 'invalid');
    if (q.required) throw new ConversationError(`${a.module}.${a.field} is required`, 'invalid');
    (rec.intake.skipped[module] ??= []).push(a.field);
    return this.advance(rec, []);
  }

  async setGoal(id: string, goal: Goal): Promise<TurnResult> {
    const rec = this.rec(id);
    this.requireState(rec, 'goal');
    if (!GOAL_OPTIONS.some((g) => g.value === goal)) throw new ConversationError('Unknown goal', 'invalid');
    rec.intake.goal = goal;
    this.move(rec, 'GOAL_SET');
    return this.advance(rec, []);
  }

  /** Fix an answer during playback, then play back again. */
  async correct(id: string, a: { module: string; field: string; value: unknown }): Promise<TurnResult> {
    const rec = this.rec(id);
    this.requireState(rec, 'playback');
    if (!isIntakeModuleId(a.module) || a.module === 'triage') throw new ConversationError('Unknown module', 'invalid');
    const q = getQuestion(a.module, a.field);
    if (!q) throw new ConversationError('Unknown field', 'invalid');
    const urgentText = this.urgentIn(a.value);
    if (urgentText) return this.escalateNow(rec, urgentText.flags, urgentText.matchedPatterns);
    await this.save(rec, q, a.value, 'confirmed');
    this.move(rec, 'CORRECTION');
    return this.advance(rec, []);
  }

  /** Caller confirmed the playback: run rules, write to the CRM, queue the assessment for the attorney. */
  async confirm(id: string): Promise<TurnResult> {
    const rec = this.rec(id);
    this.requireState(rec, 'playback');
    const missing = this.intakeModules(rec).flatMap((m) => missingRequired(m, rec.intake.modules[m] ?? {}).map((f) => `${m}.${f}`));
    if (missing.length) throw new ConversationError(`Missing required answers: ${missing.join(', ')}`, 'invalid');
    this.move(rec, 'CONFIRMED');
    this.deps.audit.write({ actorType: 'user', action: 'intake.confirm', entityType: 'IntakeRecord', entityId: rec.intake.id });

    const call = this.agentCall(rec);
    const rulesOut = await invokeTool(this.tools, call, 'runRules', { intakeId: rec.intake.id, input: { goal: rec.intake.goal, modules: rec.intake.modules } });

    // CRM writeback (section 11): person, matter, intake, task.
    const person = await this.upsertPersonFromIntake(rec);
    rec.conversation.personId = person.id;
    const goal = rec.intake.goal ?? 'other';
    const { matterId } = await this.deps.crm.createMatter(person.id, goal);
    await this.deps.crm.writeIntake(matterId, this.intakeRecord(rec));
    await this.deps.crm.createTask(matterId, { title: 'Attorney review: new intake assessment' });
    this.deps.audit.write({ actorType: 'agent', action: 'crm.write', entityType: 'Matter', entityId: matterId, metadata: { ops: ['upsertPerson', 'createMatter', 'writeIntake', 'createTask'] } });

    const assessment = this.buildAssessment(rec, rulesOut);
    this.assessments.set(assessment.id, assessment);
    const item = await invokeTool(this.tools, { ...call, conversationPersonId: person.id }, 'createReviewItem', {
      kind: 'assessment', personId: person.id, aiDraft: assessment.memoMarkdown, assessmentId: assessment.id, reason: 'new_intake',
    });
    for (const q of rec.intake.pendingQuestions)
      await invokeTool(this.tools, { ...call, conversationPersonId: person.id }, 'createReviewItem', {
        kind: 'legal_question', personId: person.id, question: q, aiDraft: '(No AI draft. Asked during intake; answer at consultation or by message.)', reason: 'asked_during_intake',
      });
    this.move(rec, 'ASSESSMENT_QUEUED');

    // Booking: whether the first consult is paid at booking is an open decision (CLAUDE.md section 16).
    // Until it is decided, staff book by hand from the CRM task.
    const lang = rec.conversation.lang;
    this.move(rec, 'DONE');
    return { ...this.turn(rec, [t(lang, 'agent.intake_saved'), t(lang, 'agent.booking_next_step')].map((m) => this.safe(rec, m))), reviewItemId: item.id };
  }

  /** Free text from the caller at any point. */
  async say(id: string, text: string): Promise<TurnResult> {
    const rec = this.rec(id);
    const lang = rec.conversation.lang;
    const esc = checkEscalation(text);
    if (esc.urgent && rec.conversation.state !== 'start' && rec.conversation.state !== 'end') return this.escalateNow(rec, esc.flags, esc.matchedPatterns);

    const state = rec.conversation.state;
    if (state === 'existing_client') return this.askFromFile(rec, text);

    if (state === 'end' || state === 'escalate' || state === 'on_call_alert' || state === 'live_transfer') return this.turn(rec, []);

    // During intake, a legal question is noted for the attorney and the intake continues.
    const call = this.agentCall(rec);
    const c = await invokeTool(this.tools, call, 'classifyQuestion', { text });
    if (c.label === 'urgent') return this.escalateNow(rec, c.urgentFlags, c.matchedPatterns);
    if (c.label === 'legal_question') {
      rec.intake.pendingQuestions.push(text);
      return this.advance(rec, [t(lang, 'agent.question_for_consult')]);
    }
    return this.advance(rec, [t(lang, 'agent.answer_this_question')]);
  }

  async hangup(id: string): Promise<TurnResult> {
    const rec = this.rec(id);
    if (rec.conversation.state !== 'end') this.move(rec, 'HANGUP');
    return this.turn(rec, []);
  }

  // ---------- ask from file ----------

  private async askFromFile(rec: ConversationRecord, text: string): Promise<TurnResult> {
    const lang = rec.conversation.lang;
    const personId = rec.conversation.personId!;
    const call = this.agentCall(rec);
    const c = await invokeTool(this.tools, call, 'classifyQuestion', { text });
    if (c.label === 'urgent') return this.escalateNow(rec, c.urgentFlags, c.matchedPatterns);
    if (c.label === 'off_topic') return this.turn(rec, [this.safe(rec, t(lang, 'agent.off_topic'))]);

    if (c.label === 'legal_question') {
      this.move(rec, 'ASK_LEGAL');
      const facts = await invokeTool(this.tools, call, 'getCaseFacts', { personId });
      const draft = await this.draftForAttorney(facts, text);
      const item = await invokeTool(this.tools, call, 'createReviewItem', {
        kind: 'legal_question', personId, question: text, aiDraft: draft, reason: c.reasons[0] ?? 'legal_question',
      });
      this.move(rec, 'REVIEW_CREATED');
      this.move(rec, 'CONTINUE');
      return { ...this.turn(rec, [this.safe(rec, t(lang, 'agent.legal_question_routed'))]), reviewItemId: item.id };
    }

    // fact or general_info: answer only from the file.
    this.move(rec, 'ASK_FACT');
    const facts = await invokeTool(this.tools, call, 'getCaseFacts', { personId });
    const raw = await this.composeAnswer(facts, text, lang);

    if (raw === NEEDS_ATTORNEY || raw === NOT_IN_FILE) {
      const item = await invokeTool(this.tools, call, 'createReviewItem', {
        kind: 'legal_question', personId, question: text, aiDraft: '(No AI draft.)', reason: raw === NEEDS_ATTORNEY ? 'llm_needs_attorney' : 'not_in_file',
      });
      this.move(rec, 'ANSWERED');
      const msg = raw === NEEDS_ATTORNEY ? t(lang, 'agent.legal_question_routed') : t(lang, 'agent.not_in_file');
      return { ...this.turn(rec, [this.safe(rec, msg)]), reviewItemId: item.id };
    }

    const out = enforceOutput(raw, lang, { allowedDates: factDates(facts) });
    this.deps.audit.write({
      actorType: 'agent', action: out.blocked ? 'ai.output.blocked' : 'ai.output', entityType: 'Conversation', entityId: rec.conversation.id,
      metadata: { purpose: 'answer_from_file', promptVersion: PROMPT_VERSION, model: this.deps.llm?.name ?? 'template', violations: out.violations.map((v) => v.ruleId), outputSha256: createHash('sha256').update(raw).digest('hex') },
    });
    let reviewItemId: string | undefined;
    if (out.blocked) {
      this.deps.logger.warn('ai.output.blocked', { conversationId: rec.conversation.id, violations: out.violations.map((v) => v.ruleId) });
      // The blocked message tells the client the team will follow up, so make that true.
      const item = await invokeTool(this.tools, call, 'createReviewItem', {
        kind: 'legal_question', personId, question: text, aiDraft: raw, reason: 'answer_blocked',
      });
      reviewItemId = item.id;
    }
    this.move(rec, 'ANSWERED');
    const turn = this.turn(rec, [out.text]);
    return reviewItemId ? { ...turn, reviewItemId } : turn;
  }

  private async composeAnswer(facts: CaseFacts, question: string, lang: Lang): Promise<string> {
    if (this.deps.llm) {
      try {
        const res = await this.deps.llm.complete({
          purpose: 'answer_from_file',
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `LANGUAGE: ${lang}\nFACTS (JSON):\n${JSON.stringify(facts)}\n\nQUESTION:\n${question}` }],
        });
        if (res.refused || !res.text) return NEEDS_ATTORNEY;
        const text = res.text.trim();
        if (text.includes(NEEDS_ATTORNEY)) return NEEDS_ATTORNEY;
        if (text.includes(NOT_IN_FILE)) return NOT_IN_FILE;
        return text;
      } catch (err) {
        this.deps.logger.error('llm.error', { purpose: 'answer_from_file', err });
      }
    }
    return templateAnswer(facts, question, lang, this.deps.today()) ?? NOT_IN_FILE;
  }

  /** Draft for the attorney only. Never shown to the client unless an attorney approves it. */
  private async draftForAttorney(facts: CaseFacts, question: string): Promise<string> {
    if (!this.deps.llm) return '(No AI draft: no LLM configured.)';
    try {
      const res = await this.deps.llm.complete({
        purpose: 'draft_for_attorney',
        system: 'You draft short answers for an immigration attorney to review, edit or reject. The client will only see the answer if the attorney approves it. Use the FACTS. Flag anything you are unsure of. Write in English.',
        messages: [{ role: 'user', content: `FACTS (JSON):\n${JSON.stringify(facts)}\n\nCLIENT QUESTION:\n${question}` }],
      });
      return res.text || '(No AI draft.)';
    } catch (err) {
      this.deps.logger.error('llm.error', { purpose: 'draft_for_attorney', err });
      return '(No AI draft: LLM error.)';
    }
  }

  // ---------- flow ----------

  /** Moves through states that need no input, and returns the next thing to ask. */
  private async advance(rec: ConversationRecord, messages: string[]): Promise<TurnResult> {
    const lang = rec.conversation.lang;
    for (;;) {
      const state = rec.conversation.state;
      if (state === 'triage') {
        const q = nextQuestion('triage', rec.intake.modules.triage ?? {}, rec.intake.skipped.triage);
        if (q) return this.turn(rec, messages, this.view(q, lang));
        const flags = computeUrgentFlags({ modules: rec.intake.modules }, { today: this.deps.today() });
        if (flags.length) return this.escalateNow(rec, flags, [], 'TRIAGE_URGENT', messages);
        this.move(rec, 'TRIAGE_CLEAR');
        continue;
      }
      if (state === 'identify') {
        if (rec.verifiedPersonId) {
          rec.conversation.personId = rec.verifiedPersonId;
          this.move(rec, 'VERIFIED_CLIENT');
        } else {
          this.move(rec, 'NEW_CALLER');
          this.move(rec, 'START_INTAKE');
        }
        continue;
      }
      if (state === 'existing_client') return this.turn(rec, [...messages, t(lang, 'agent.ask_prompt')]);
      if (state === 'goal') return this.turn(rec, messages, this.goalView(lang));
      if (state === 'core' || state === 'history' || state === 'module') {
        const m = this.currentModule(rec);
        const q = m ? nextQuestion(m, rec.intake.modules[m] ?? {}, rec.intake.skipped[m]) : null;
        if (q) return this.turn(rec, messages, this.view(q, lang));
        this.move(rec, 'MODULE_DONE');
        continue;
      }
      if (state === 'red_flags' || state === 'documents') {
        // Not built in Milestone 1 (red_flags and documents modules come next). Pass through.
        this.move(rec, 'MODULE_DONE');
        continue;
      }
      if (state === 'playback') return { ...this.turn(rec, [...messages, t(lang, 'agent.playback_intro')]), playback: this.playbackLines(rec) };
      return this.turn(rec, messages);
    }
  }

  private async escalateNow(rec: ConversationRecord, flags: UrgentFlag[], matchedPatterns: string[], event: AgentEvent = 'URGENT', messages: string[] = []): Promise<TurnResult> {
    const lang = rec.conversation.lang;
    this.move(rec, event);
    rec.conversation.urgentFlags = [...new Set([...rec.conversation.urgentFlags, ...flags])];
    const esc = await invokeTool(this.tools, this.agentCall(rec), 'escalate', {
      conversationId: rec.conversation.id,
      channel: rec.conversation.channel,
      flags,
      matchedPatterns,
      ...(rec.conversation.personId ? { personId: rec.conversation.personId } : {}),
    });
    this.move(rec, esc.mode === 'live_transfer' ? 'LIVE_TRANSFER' : 'ON_CALL_ALERT');
    const msgs = [...messages, t(lang, 'agent.urgent_escalation')];
    if (esc.mode === 'on_call_alert') msgs.push(t(lang, 'agent.on_call_alerted'));
    return { ...this.turn(rec, msgs), escalation: { id: esc.id, mode: esc.mode, flags } };
  }

  // ---------- helpers ----------

  private rec(id: string): ConversationRecord {
    const r = this.records.get(id);
    if (!r) throw new ConversationError('Conversation not found', 'not_found');
    return r;
  }

  private requireState(rec: ConversationRecord, s: AgentState) {
    if (rec.conversation.state !== s) throw new ConversationError(`Expected state ${s}, is ${rec.conversation.state}`, 'bad_state');
  }

  private move(rec: ConversationRecord, e: AgentEvent) {
    rec.conversation.state = transition(rec.conversation.state, e);
  }

  private agentCall(rec: ConversationRecord): ToolCall {
    const actor: Actor = { type: 'agent' };
    const call: ToolCall = { actor, conversationId: rec.conversation.id };
    if (rec.conversation.personId) call.conversationPersonId = rec.conversation.personId;
    return call;
  }

  private currentModule(rec: ConversationRecord): IntakeModuleId | null {
    const s = STATE_MODULE[rec.conversation.state];
    if (!s) return null;
    if (s === 'module') return rec.intake.goal ? moduleForGoal(rec.intake.goal) : null;
    return s;
  }

  private intakeModules(rec: ConversationRecord): IntakeModuleId[] {
    const m = rec.intake.goal ? moduleForGoal(rec.intake.goal) : null;
    return ['triage', 'core', 'history', ...(m ? [m] : [])];
  }

  private urgentIn(value: unknown): { flags: UrgentFlag[]; matchedPatterns: string[] } | null {
    const texts = typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    for (const s of texts) {
      const e = checkEscalation(s);
      if (e.urgent) return e;
    }
    return null;
  }

  private async save(rec: ConversationRecord, q: Question, value: unknown, confidence: 'confirmed' | 'unsure') {
    const v = validateAnswer(q.module, q.id, value);
    if (!v.ok) throw new ConversationError(`Invalid answer for ${q.module}.${q.id}: ${v.error}`, 'invalid');
    let stored: FieldValue = v.value;
    // Guardrail 8: the A-number is encrypted as soon as it is captured, with the Person column's context
    // so it can be written to the CRM without re-encrypting.
    if (q.encrypted && typeof v.value === 'string') {
      const plain = q.id === 'a_number' ? normalizeANumber(v.value) : v.value;
      stored = { kind: 'encrypted', value: encryptField(plain, q.id === 'a_number' ? ENCRYPTED_COLUMNS.personANumber : ENCRYPTED_COLUMNS.intakeSensitiveModules, this.deps.keyRing) };
    }
    await invokeTool(this.tools, this.agentCall(rec), 'saveIntakeField', { intakeId: rec.intake.id, module: q.module, field: q.id, value: stored, confidence });
  }

  /** Every client-facing message goes through the output checker and carries the label (guardrail 7). */
  private safe(rec: ConversationRecord, text: string): string {
    return enforceOutput(text, rec.conversation.lang).text;
  }

  private view(q: Question, lang: Lang): QuestionView {
    const v: QuestionView = {
      module: q.module, id: q.id, prompt: q.prompt[lang], type: q.type, required: q.required,
      sensitive: q.sensitive, allowDiscussWithAttorney: q.allowDiscussWithAttorney,
    };
    if (q.options) v.options = q.options.map((o) => ({ value: o.value, label: o.label[lang] }));
    return v;
  }

  private goalView(lang: Lang): QuestionView {
    return {
      module: 'goal', id: 'goal', prompt: GOAL_PROMPT[lang], type: 'enum', required: true, sensitive: false, allowDiscussWithAttorney: false,
      options: GOAL_OPTIONS.map((o) => ({ value: o.value, label: o.label[lang] })),
    };
  }

  private playbackLines(rec: ConversationRecord): string[] {
    const lang = rec.conversation.lang;
    const lines: string[] = [];
    for (const m of this.intakeModules(rec).filter((x) => x !== 'triage')) {
      const answers = rec.intake.modules[m] ?? {};
      for (const q of MODULES[m].questions) {
        if (!(q.id in answers)) continue;
        const val = formatAnswer(q, answers[q.id]!, lang);
        if (val) lines.push(`${q.prompt[lang]} ${val}`);
      }
    }
    return lines;
  }

  private turn(rec: ConversationRecord, messages: string[], question: QuestionView | null = null): TurnResult {
    return { conversationId: rec.conversation.id, state: rec.conversation.state, messages, question };
  }

  private intakeRecord(rec: ConversationRecord): IntakeRecord {
    return {
      id: rec.intake.id,
      conversationId: rec.conversation.id,
      goal: rec.intake.goal ?? 'other',
      modules: structuredClone(rec.intake.modules),
      uncertainFields: [...rec.intake.uncertain],
      discussWithAttorney: [...rec.intake.discuss],
      documents: [],
    };
  }

  private async upsertPersonFromIntake(rec: ConversationRecord): Promise<Person> {
    const core = rec.intake.modules.core ?? {};
    const str = (k: string) => (typeof core[k] === 'string' ? (core[k] as string) : undefined);
    const list = (k: string) => (Array.isArray(core[k]) ? (core[k] as unknown[]).filter((x): x is string => typeof x === 'string') : undefined);
    const p: Partial<Person> = { fullName: str('full_name')!, smsConsent: core.sms_consent === true, preferredLang: rec.conversation.lang };
    const opt: [keyof Person, unknown][] = [
      ['phone', str('phone')], ['email', str('email')], ['state', str('state')], ['city', str('city')],
      ['countryOfBirth', str('country_of_birth')], ['otherNames', list('other_names')], ['citizenships', list('citizenships')],
    ];
    for (const [k, v] of opt) if (v !== undefined) (p as Record<string, unknown>)[k] = v;
    const a = rec.intake.modules.history?.a_number;
    if (typeof a === 'object' && a !== null && !Array.isArray(a) && a.kind === 'encrypted') p.aNumber = a.value;
    const person = await this.deps.crm.upsertPerson(p);
    this.deps.audit.write({ actorType: 'agent', action: 'person.write', entityType: 'Person', entityId: person.id, metadata: { source: 'intake' } });
    return person;
  }

  private buildAssessment(rec: ConversationRecord, r: RulesOutput): Assessment {
    const id = `asm_${randomUUID()}`;
    return {
      id,
      intakeId: rec.intake.id,
      pathways: r.pathwayHints.map((h) => ({ code: h.code, label: h.label, confidence: 'low', dependsOn: h.dependsOn })),
      redFlags: r.redFlags,
      deadlines: r.deadlines,
      documentChecklist: [],
      memoMarkdown: this.memo(rec, r),
      rulesVersion: r.rulesVersion,
      status: 'pending_review',
    };
  }

  /** Deterministic memo for the attorney. The LLM may later explain it in plain language, never change it. */
  private memo(rec: ConversationRecord, r: RulesOutput): string {
    const lines: string[] = [];
    lines.push('# Intake assessment (draft for attorney review)', '');
    lines.push(`Rules version ${r.rulesVersion}. ${r.unverifiedRuleIds.length} of the rules that ran are not yet attorney-verified.`, '');
    lines.push(`Goal: ${rec.intake.goal ?? 'other'}. Language: ${rec.conversation.lang}. Channel: ${rec.conversation.channel}.`, '');
    const section = (title: string, items: string[]) => {
      lines.push(`## ${title}`, ...(items.length ? items.map((i) => `- ${i}`) : ['- None']), '');
    };
    section('Red flags', r.redFlags.map((f) => `${f.code}: ${f.note} (rule ${f.ruleId})`));
    section('Deadlines', r.deadlines.map((d) => `${d.date}: ${d.label} (rule ${d.ruleId})`));
    section('Pathway hints', r.pathwayHints.map((h) => `${h.label} (rule ${h.ruleId})`));
    section('Caller unsure', rec.intake.uncertain);
    section('Caller prefers to discuss with attorney', rec.intake.discuss);
    section('Questions the caller asked', rec.intake.pendingQuestions);
    lines.push('## Answers');
    for (const m of this.intakeModules(rec)) {
      const answers = rec.intake.modules[m] ?? {};
      for (const q of MODULES[m].questions) {
        if (!(q.id in answers)) continue;
        const v = answers[q.id]!;
        const shown = typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'encrypted' ? '(encrypted; open the record to view)' : formatAnswer(q, v, 'en');
        lines.push(`- ${m}.${q.id}: ${shown}`);
      }
    }
    return lines.join('\n');
  }
}
