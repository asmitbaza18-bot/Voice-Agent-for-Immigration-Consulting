import type { QuestionView, TurnResult } from '@chhetry/agent';
import type { AuditEntry } from '@chhetry/db';
import { factsNotAdviceLabel, needsNativeReview, t } from '@chhetry/i18n';
import type { CaseSummary, FieldValue, Lang, ReviewItem } from '@chhetry/shared';
import { DEMO_MODEL } from './demo-llm.js';
import { createDemoEngine } from './engine.js';
import { SAMPLE_ANSWERS, SUGGESTED_QUESTIONS, ui, type UiKey } from './strings.js';

/**
 * Demo UI. Plain DOM, no framework. Every client-facing message is the
 * agent's own output (already passed through the guardrails); this file
 * only lays it out.
 */

type Who = 'new' | 'per_sita_sharma' | 'per_ram_sharma';
type Pane = 'client' | 'firm';
type FirmTab = 'queue' | 'alerts' | 'crm' | 'audit';

interface Msg {
  from: 'agent' | 'user' | 'attorney';
  text: string;
  urgent?: boolean;
  trace?: string[];
}

const engine = createDemoEngine();

const state = {
  lang: 'en' as Lang,
  who: 'per_sita_sharma' as Who,
  pane: 'client' as Pane,
  firmTab: 'queue' as FirmTab,
  showTrace: true,
  convId: '',
  turn: null as TurnResult | null,
  msgs: [] as Msg[],
  disc: { ai: false, rec: false, info: false },
  seenAnswers: new Set<string>(),
  auditMark: 0,
  error: '',
  casesOpen: true,
  answersOpen: false,
  editing: new Set<string>(),
  toast: '',
  cases: [] as CaseSummary[],
  aNumber: null as string | null,
  answers: [] as { id: string; question?: string; answer: string; decidedAt: string }[],
  queue: [] as ReviewItem[],
  names: new Map<string, string>(),
};

const L = (k: UiKey) => ui(state.lang, k);

// ---------- tiny DOM helper ----------

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

// ---------- conversation ----------

const isEnd = (s: string) => ['end', 'escalate', 'on_call_alert', 'live_transfer'].includes(s);

function newTrace(): string[] {
  const all = engine.audit.entries();
  const fresh = all.slice(state.auditMark);
  state.auditMark = all.length;
  return fresh.map(describeAudit).filter((x): x is string => !!x);
}

const TOOL_TEXT: Record<string, string> = {
  classifyQuestion: 'Classifier: fact, general info, legal question or urgent?',
  getCaseFacts: 'Read the case file from the CRM',
  runRules: 'Ran the rules engine on the intake',
};

function describeAudit(e: AuditEntry): string | null {
  const m = e.metadata as Record<string, unknown>;
  const tool = typeof m.tool === 'string' ? m.tool : null;
  switch (e.action) {
    case 'conversation.start': return 'Conversation opened with disclosures';
    case 'conversation.disclosures_accepted': return `Disclosures accepted (recording ${m.recordingConsent ? 'on' : 'off'})`;
    case 'intake.field.write': return `Saved ${m.module ?? ''}.${m.field ?? ''}${m.sensitive ? ' (sensitive)' : ''}`;
    case 'intake.confirm': return 'Caller confirmed the playback';
    case 'ai.output': return `Answer checked by guardrails: passed (${m.model})`;
    case 'ai.output.blocked': return `Answer blocked by guardrails: ${(m.violations as string[]).join(', ')}`;
    case 'review.create': return `Sent to attorney review queue (${m.kind}, ${m.reason})`;
    case 'escalation.create': return `URGENT: on-call alert raised (${(m.flags as string[]).join(', ')})`;
    case 'crm.write': return `Written to CRM: ${(m.ops as string[]).join(', ')}`;
    case 'person.write': return 'CRM person record created';
    case 'tool.denied': return `Tool denied: ${tool}`;
    default: return tool ? TOOL_TEXT[tool] ?? null : null;
  }
}

function push(turn: TurnResult) {
  const trace = newTrace();
  const msgs = [...turn.messages];
  if (turn.playback?.length) msgs.push(turn.playback.map((l) => `• ${l}`).join('\n'));
  if (turn.question) msgs.push(turn.question.prompt);
  msgs.forEach((text, i) => {
    const m: Msg = { from: 'agent', text };
    if (turn.escalation && i === 0) m.urgent = true;
    if (i === msgs.length - 1 && trace.length) m.trace = trace;
    state.msgs.push(m);
  });
  if (!msgs.length && trace.length) state.msgs.push({ from: 'agent', text: '', trace });
  state.turn = turn;
}

async function run(userText: string | null, fn: () => Promise<TurnResult>) {
  state.error = '';
  try {
    const turn = await fn();
    if (userText !== null) state.msgs.push({ from: 'user', text: userText });
    push(turn);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
  await render();
  scrollChat();
}

async function startConversation() {
  state.msgs = [];
  state.disc = { ai: false, rec: false, info: false };
  state.error = '';
  const personId = state.who === 'new' ? undefined : state.who;
  const { turn } = await engine.start(state.lang, personId);
  state.convId = turn.conversationId;
  newTrace();
  state.turn = turn;
  // Approved answers that already exist are shown in the "Answers from your attorney" box, not replayed.
  if (personId) for (const a of await engine.reviewQueue.clientAnswers(personId)) state.seenAnswers.add(a.id);
  await render();
}

function personId(): string | undefined {
  return state.who === 'new' ? engine.conversations.get(state.convId).personId : state.who;
}

function answerLabel(q: QuestionView, v: FieldValue): string {
  if (v && typeof v === 'object' && !Array.isArray(v) && v.kind === 'discuss_with_attorney') return L('q.discuss');
  if (v && typeof v === 'object' && !Array.isArray(v) && v.kind === 'date') return v.value;
  if (typeof v === 'boolean') return v ? L('q.yes') : L('q.no');
  if (q.options && typeof v === 'string') return q.options.find((o) => o.value === v)?.label ?? v;
  if (q.id === 'a_number' && typeof v === 'string') return `••••${v.slice(-3)}`;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function answer(q: QuestionView, value: FieldValue) {
  const label = answerLabel(q, value);
  if (q.module === 'goal') return run(label, () => engine.conversations.setGoal(state.convId, value as never));
  return run(label, () => engine.conversations.answer(state.convId, { module: q.module, field: q.id, value }));
}

function skip(q: QuestionView) {
  return run(`(${L('q.skip')})`, () => engine.conversations.skip(state.convId, { module: q.module, field: q.id }));
}

function say(text: string) {
  const s = text.trim();
  if (!s) return;
  return run(s, () => engine.conversations.say(state.convId, s));
}

// ---------- rendering: client ----------

function messageBody(text: string) {
  const label = factsNotAdviceLabel(state.lang);
  const parts: Child[] = [];
  let body = text;
  let tag: Child = null;
  if (body.trimEnd().endsWith(label)) {
    body = body.trimEnd().slice(0, -label.length).trimEnd();
    tag = h('span', { class: 'tag tag-label' }, label);
  }
  parts.push(h('div', { class: 'bubble-text' }, body));
  if (tag) parts.push(tag);
  return parts;
}

function renderMsg(m: Msg) {
  if (!m.text && m.trace) return state.showTrace ? h('div', { class: 'trace' }, m.trace.map((x) => h('div', {}, x))) : null;
  const who = m.from === 'user' ? L('you') : m.from === 'attorney' ? t(state.lang, 'label.attorney_reviewed') : L('assistant');
  return h('div', { class: `msg msg-${m.from}${m.urgent ? ' msg-urgent' : ''}` },
    h('div', { class: 'msg-who' }, who),
    h('div', { class: 'bubble' }, messageBody(m.text)),
    m.trace && state.showTrace ? h('div', { class: 'trace' }, m.trace.map((x) => h('div', {}, x))) : null,
  );
}

function renderDisclosures(turn: TurnResult) {
  const box = (key: 'ai' | 'rec' | 'info', label: string) =>
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', id: `disc-${key}`, checked: state.disc[key], onchange: (e: Event) => { state.disc[key] = (e.target as HTMLInputElement).checked; void render(); } }),
      h('span', {}, label));
  return h('div', { class: 'card disclosures' },
    h('h3', {}, L('disc.title')),
    h('ul', { class: 'disc-list' }, turn.messages.map((m) => h('li', {}, m))),
    box('ai', L('disc.ai_ack')),
    box('rec', L('disc.record')),
    box('info', L('disc.info_ack')),
    h('button', {
      class: 'btn btn-primary', disabled: !(state.disc.ai && state.disc.info),
      onclick: () => run(null, () => engine.conversations.acceptDisclosures(state.convId, { aiDisclosureAck: state.disc.ai, recordingConsent: state.disc.rec, infoNotAdviceAck: state.disc.info })),
    }, L('disc.continue')),
  );
}

function renderQuestion(q: QuestionView) {
  const controls: Child[] = [];
  const sample = SAMPLE_ANSWERS[`${q.module}.${q.id}`];
  const inputId = `q-${q.module}-${q.id}`;
  const readInput = (): FieldValue | null => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    const raw = el?.value.trim() ?? '';
    if (!raw) return null;
    if (q.type === 'date') return { kind: 'date', value: raw };
    if (q.type === 'number') return Number(raw);
    if (q.type === 'text_list') return raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (q.type === 'number_list') return raw.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    return raw;
  };
  if (q.type === 'boolean') {
    controls.push(h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => answer(q, true) }, L('q.yes')),
      h('button', { class: 'btn', onclick: () => answer(q, false) }, L('q.no'))));
  } else if (q.type === 'enum' && q.options) {
    controls.push(h('div', { class: 'options' }, q.options.map((o) => h('button', { class: 'btn btn-option', onclick: () => answer(q, o.value) }, o.label))));
  } else {
    const submit = () => { const v = readInput(); if (v !== null) void answer(q, v); };
    controls.push(h('form', { class: 'row', onsubmit: (e: Event) => { e.preventDefault(); submit(); } },
      h('input', {
        id: inputId, class: 'input', type: q.type === 'date' ? 'date' : q.type === 'number' ? 'number' : 'text',
        autocomplete: 'off', placeholder: q.type.endsWith('_list') ? L('q.list_hint') : '',
      }),
      h('button', { class: 'btn btn-primary', type: 'submit' }, L('q.next'))));
  }
  const extras: Child[] = [];
  if (sample !== undefined) extras.push(h('button', { class: 'link', onclick: () => answer(q, sample) }, `${L('q.sample')}: ${answerLabel(q, sample)}`));
  if (!q.required) extras.push(h('button', { class: 'link', onclick: () => skip(q) }, L('q.skip')));
  if (q.allowDiscussWithAttorney) extras.push(h('button', { class: 'link', onclick: () => answer(q, { kind: 'discuss_with_attorney' }) }, L('q.discuss')));
  return h('div', { class: 'card composer-q' },
    q.sensitive ? h('p', { class: 'hint' }, L('q.sensitive')) : null,
    controls,
    extras.length ? h('div', { class: 'extras' }, extras) : null,
  );
}

function renderAsk(placeholder: string, chips: boolean) {
  const id = 'ask-input';
  const s = SUGGESTED_QUESTIONS[state.lang];
  return h('div', { class: 'ask' },
    chips ? h('div', { class: 'chips-wrap' },
      h('div', { class: 'eyebrow' }, L('ask.try')),
      h('div', { class: 'chips' },
        [...s.fact, s.legal].map((q) => h('button', { class: 'chip', onclick: () => say(q) }, q)),
        h('button', { class: 'chip chip-urgent', onclick: () => say(s.urgent) }, s.urgent))) : null,
    h('form', { class: 'row', onsubmit: (e: Event) => { e.preventDefault(); const el = document.getElementById(id) as HTMLInputElement; const v = el.value; el.value = ''; void say(v); } },
      h('input', { id, class: 'input', type: 'text', autocomplete: 'off', placeholder }),
      h('button', { class: 'btn btn-primary', type: 'submit' }, L('ask.send'))),
  );
}

function renderComposer() {
  const turn = state.turn;
  if (!turn) return null;
  if (turn.state === 'disclosures') return renderDisclosures(turn);
  if (isEnd(turn.state)) {
    return h('div', { class: `card ended${turn.escalation || engine.conversations.get(state.convId).urgentFlags.length ? ' ended-urgent' : ''}` },
      engine.conversations.get(state.convId).urgentFlags.length ? h('strong', {}, L('urgent.banner')) : null,
      h('p', {}, L('ended')),
      h('button', { class: 'btn btn-primary', onclick: () => startConversation() }, L('client.start_over')));
  }
  if (turn.state === 'playback') {
    return h('div', { class: 'card' },
      h('button', { class: 'btn btn-primary', onclick: () => run(L('playback.confirm'), () => engine.conversations.confirm(state.convId)) }, L('playback.confirm')));
  }
  if (turn.state === 'existing_client') return renderAsk(L('ask.placeholder'), true);
  if (turn.question) return h('div', {}, renderQuestion(turn.question), renderAsk(L('ask.intake_placeholder'), false));
  return null;
}

function renderCases() {
  if (state.who === 'new' || !state.cases.length) return null;
  const statusKey = (s: CaseSummary['status']) => `status.${s}` as UiKey;
  return h('details', { class: 'cases', open: state.casesOpen, ontoggle: (e: Event) => { state.casesOpen = (e.target as HTMLDetailsElement).open; } },
    h('summary', {}, L('cases.title'), state.aNumber ? h('span', { class: 'mono muted' }, ` · ${L('cases.a_number')} ${state.aNumber}`) : null),
    h('div', { class: 'case-list' }, state.cases.map((c) => {
      const next = c.steps.find((s) => s.status !== 'done');
      return h('div', { class: 'case' },
        h('div', { class: 'case-head' }, h('span', { class: 'case-title' }, c.title), h('span', { class: `pill pill-${c.status}` }, L(statusKey(c.status)))),
        next ? h('div', { class: 'case-line' }, h('span', { class: 'muted' }, `${L('cases.next')}: `), `${next.label}`, next.date ? h('span', { class: 'mono' }, ` ${next.date}`) : null) : null,
        c.missingDocuments.length ? h('div', { class: 'case-line' }, h('span', { class: 'muted' }, `${L('cases.missing')}: `), c.missingDocuments.join('; ')) : null,
      );
    })),
  );
}

function renderAnswers() {
  if (!state.answers.length) return null;
  return h('details', { class: 'answers', open: state.answersOpen, ontoggle: (e: Event) => { state.answersOpen = (e.target as HTMLDetailsElement).open; } },
    h('summary', {}, `${L('answers.title')} (${state.answers.length})`),
    state.answers.map((a) => h('div', { class: 'answer' },
      a.question ? h('div', { class: 'answer-q' }, a.question) : null,
      h('div', {}, a.answer),
      h('span', { class: 'tag tag-ok' }, t(state.lang, 'label.attorney_reviewed')))));
}

function renderClient() {
  const whoBtn = (w: Who, label: string) => h('button', { class: `seg${state.who === w ? ' seg-on' : ''}`, 'aria-pressed': state.who === w, onclick: () => { state.who = w; void startConversation(); } }, label);
  return h('section', { class: 'phone', 'aria-label': 'Client app' },
    h('div', { class: 'phone-top' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, 'CL'), h('span', {}, 'Chhetry Law')),
      h('button', { class: 'link small', onclick: () => startConversation() }, L('client.start_over'))),
    h('div', { class: 'segs', role: 'group', 'aria-label': 'Who is using the app' },
      whoBtn('per_sita_sharma', 'Sita Sharma'), whoBtn('per_ram_sharma', 'Ram Sharma'), whoBtn('new', L('client.new'))),
    needsNativeReview(state.lang) ? h('div', { class: 'draft-note' }, `${L('lang.name')}: machine translation, waiting for review by a native speaker.`) : null,
    renderCases(),
    renderAnswers(),
    h('div', { class: 'chat', id: 'chat' }, state.msgs.map(renderMsg)),
    state.error ? h('div', { class: 'error' }, state.error) : null,
    h('div', { class: 'composer' }, renderComposer()),
  );
}

function scrollChat() {
  const c = document.getElementById('chat');
  if (c) c.scrollTop = c.scrollHeight;
}

// ---------- rendering: firm ----------

const KIND_LABEL: Record<ReviewItem['kind'], string> = { legal_question: 'Legal question', assessment: 'New intake assessment' };
const STATUS_LABEL: Record<ReviewItem['status'], string> = { open: 'Waiting for attorney', approved: 'Approved and sent', edited_sent: 'Edited and sent', call_client: 'Staff will call client', rejected: 'Rejected' };
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

async function decide(item: ReviewItem, d: Parameters<typeof engine.decide>[1]) {
  try {
    await engine.decide(item.id, d);
    state.editing.delete(item.id);
    const name = state.names.get(item.personId) ?? 'the client';
    state.toast = d.decision === 'approve' || d.decision === 'edit_send'
      ? item.kind === 'legal_question' ? `Sent to ${name}'s app.` : 'Assessment marked reviewed.'
      : d.decision === 'call_client' ? `Task created: call ${name}.` : 'Rejected. Nothing was sent to the client.';
  } catch (err) {
    state.toast = err instanceof Error ? err.message : String(err);
  }
  await render();
}

function renderItem(item: ReviewItem) {
  const name = state.names.get(item.personId) ?? item.personId;
  const editing = state.editing.has(item.id);
  const noDraft = item.aiDraft.startsWith('(No AI draft');
  const editId = `edit-${item.id}`;
  return h('article', { class: `item item-${item.status}` },
    h('div', { class: 'item-head' },
      h('span', { class: `pill ${item.kind === 'assessment' ? 'pill-pending' : 'pill-rfe'}` }, KIND_LABEL[item.kind]),
      h('strong', {}, name),
      h('span', { class: 'muted small' }, `${time(item.createdAt)}${item.reason ? ` · ${item.reason.replace(/_/g, ' ')}` : ''}`),
      h('span', { class: `status status-${item.status}` }, STATUS_LABEL[item.status])),
    item.question ? h('div', { class: 'item-q' }, h('div', { class: 'eyebrow' }, 'Client asked'), h('div', {}, item.question)) : null,
    h('div', { class: 'eyebrow' }, item.kind === 'assessment' ? 'Rules engine memo (rules not yet attorney-verified)' : noDraft ? 'No draft' : `Draft (${DEMO_MODEL}). The client has not seen this.`),
    editing
      ? h('textarea', { id: editId, class: 'input textarea', value: noDraft ? '' : item.aiDraft })
      : h('pre', { class: `draft${item.kind === 'assessment' ? ' memo' : ''}` }, item.aiDraft),
    item.finalText && item.kind === 'legal_question' ? h('div', { class: 'final' }, h('div', { class: 'eyebrow' }, 'Sent to client'), item.finalText) : null,
    item.status === 'open' ? h('div', { class: 'row wrap' },
      editing
        ? [
          h('button', { class: 'btn btn-primary', onclick: () => { const v = (document.getElementById(editId) as HTMLTextAreaElement).value; void decide(item, { decision: 'edit_send', finalText: v }); } }, 'Send my version'),
          h('button', { class: 'btn', onclick: () => { state.editing.delete(item.id); void render(); } }, 'Cancel'),
        ]
        : [
          h('button', { class: 'btn btn-primary', disabled: noDraft, title: noDraft ? 'There is no draft to approve. Use Edit and send.' : '', onclick: () => decide(item, { decision: 'approve' }) }, item.kind === 'assessment' ? 'Approve assessment' : 'Approve and send'),
          h('button', { class: 'btn', onclick: () => { state.editing.add(item.id); void render(); } }, 'Edit and send'),
          h('button', { class: 'btn', onclick: () => decide(item, { decision: 'call_client' }) }, 'Call client instead'),
          h('button', { class: 'btn btn-quiet', onclick: () => decide(item, { decision: 'reject' }) }, 'Reject'),
        ]) : null,
  );
}

async function renderFirm() {
  const open = state.queue.filter((i) => i.status === 'open');
  const decided = state.queue.filter((i) => i.status !== 'open');
  const alerts = await engine.escalations.list();
  const matters = engine.matters();
  const audit = engine.audit.entries();
  const tab = (id: FirmTab, label: string, n: number) => h('button', { class: `tab${state.firmTab === id ? ' tab-on' : ''}`, role: 'tab', 'aria-selected': state.firmTab === id, onclick: () => { state.firmTab = id; void render(); } }, label, n ? h('span', { class: `count${id === 'alerts' ? ' count-urgent' : ''}` }, String(n)) : null);

  let body: Child;
  if (state.firmTab === 'queue') {
    body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Every legal question and every new intake lands here. Only text an attorney approves, or edits and sends, reaches the client.'),
      open.length ? open.slice().reverse().map(renderItem) : h('div', { class: 'empty' }, 'Nothing waiting. Ask a "Can I…" question as Sita or Ram, or finish a new-client intake, and it will appear here.'),
      decided.length ? h('details', { class: 'decided' }, h('summary', {}, `Decided (${decided.length})`), decided.slice().reverse().map(renderItem)) : null);
  } else if (state.firmTab === 'alerts') {
    body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Detention, ICE contact, a hearing within 7 days, a removal order, a deadline within 14 days, being stuck abroad, or danger stops the conversation and pages the on-call team.'),
      alerts.length ? alerts.slice().reverse().map((a) => h('article', { class: 'item item-urgent' },
        h('div', { class: 'item-head' }, h('span', { class: 'pill pill-urgent' }, 'On-call alert'), h('strong', {}, a.personId ? state.names.get(a.personId) ?? a.personId : 'New caller'), h('span', { class: 'muted small' }, `${time(a.createdAt)} · ${a.channel} channel`)),
        h('div', {}, 'Flags: ', a.flags.map((f) => h('span', { class: 'tag tag-urgent' }, f.replace(/_/g, ' ')))),
        a.matchedPatterns?.length ? h('div', { class: 'muted small' }, `Matched: ${a.matchedPatterns.join(', ')}`) : null,
        h('div', { class: 'muted small' }, 'Phone calls will transfer live once the phone line is connected. Who gets paged is still a firm decision.'))) : h('div', { class: 'empty' }, 'No alerts. Tap the red example question in the client app to see one.'));
  } else if (state.firmTab === 'crm') {
    body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'What the agent wrote back to the case-management system (a mock of it in this demo). Sensitive answers are encrypted; the A-number is masked.'),
      matters.length ? matters.map((m) => h('article', { class: 'item' },
        h('div', { class: 'item-head' }, h('span', { class: 'pill pill-open' }, 'New matter'), h('strong', {}, m.person?.fullName ?? m.personId), h('span', { class: 'muted small' }, `Goal: ${m.goal.replace(/_/g, ' ')}`)),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Phone'), h('dd', {}, m.person?.phone ?? ''),
          h('dt', {}, 'A-number'), h('dd', { class: 'mono' }, engine.maskedANumber(m.person) ?? 'Not given'),
          h('dt', {}, 'Language'), h('dd', {}, m.person?.preferredLang ?? ''),
          h('dt', {}, 'Intake fields'), h('dd', {}, String(m.intakes.reduce((n, i) => n + Object.values(i.modules).reduce((k, f) => k + Object.keys(f ?? {}).length, 0), 0))),
          h('dt', {}, 'Tasks'), h('dd', {}, m.tasks.map((x) => x.title).join('; '))))) : h('div', { class: 'empty' }, 'No new matters yet. Finish a new-client intake to see the CRM record it creates.'));
  } else {
    body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Every read and write of client data, every AI output and every attorney decision is logged. Values are never logged, only that something happened.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'audit' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Who'), h('th', {}, 'Action'), h('th', {}, 'Details'))),
        h('tbody', {}, audit.slice().reverse().slice(0, 150).map((e) => h('tr', {},
          h('td', { class: 'mono' }, time(e.at)),
          h('td', {}, e.actorRole ?? e.actorType),
          h('td', { class: 'mono' }, e.action),
          h('td', { class: 'mono small' }, JSON.stringify(e.metadata))))))));
  }

  return h('section', { class: 'firm', 'aria-label': 'Firm side' },
    h('div', { class: 'firm-head' }, h('h2', {}, 'Firm side'), h('span', { class: 'muted small' }, 'Signed in as attorney (demo)')),
    h('div', { class: 'tabs', role: 'tablist' },
      tab('queue', 'Review queue', open.length), tab('alerts', 'Urgent alerts', alerts.length), tab('crm', 'CRM records', matters.length), tab('audit', 'Audit log', 0)),
    state.toast ? h('div', { class: 'toast', role: 'status' }, state.toast) : null,
    body);
}

// ---------- top level ----------

async function refreshData() {
  const pid = state.convId ? personId() : undefined;
  if (state.who !== 'new') {
    state.cases = await engine.crm.getCases(state.who);
    state.aNumber = engine.maskedANumber(await engine.person(state.who));
  } else {
    state.cases = [];
    state.aNumber = null;
  }
  state.answers = pid ? await engine.reviewQueue.clientAnswers(pid) : [];
  // An attorney decision made while this conversation is open shows up in the chat too.
  for (const a of state.answers) {
    if (state.seenAnswers.has(a.id)) continue;
    state.seenAnswers.add(a.id);
    state.msgs.push({ from: 'attorney', text: a.question ? `“${a.question}”\n\n${a.answer}` : a.answer });
  }
  state.queue = await engine.reviewQueue.list();
  for (const i of state.queue) if (!state.names.has(i.personId)) state.names.set(i.personId, await engine.personName(i.personId));
  for (const p of engine.seedPeople) state.names.set(p.id, p.fullName);
}

async function render() {
  await refreshData();
  const root = document.getElementById('app')!;
  const openCount = state.queue.filter((i) => i.status === 'open').length + (await engine.escalations.list()).length;
  const langBtn = (l: Lang, label: string) => h('button', { class: `seg${state.lang === l ? ' seg-on' : ''}`, lang: l, 'aria-pressed': state.lang === l, onclick: () => { if (state.lang !== l) { state.lang = l; document.documentElement.lang = l; void startConversation(); } } }, label);
  const paneBtn = (p: Pane, label: string, n = 0) => h('button', { class: `seg${state.pane === p ? ' seg-on' : ''}`, onclick: () => { state.pane = p; void render(); } }, label, n ? h('span', { class: 'count' }, String(n)) : null);
  const firm = await renderFirm();
  const scrollY = window.scrollY;
  root.replaceChildren(
    h('header', { class: 'top' },
      h('div', { class: 'top-row' },
        h('div', {},
          h('h1', {}, 'Chhetry Law assistant'),
          h('p', { class: 'muted small' }, 'Clickable demo of the client app and the attorney review queue')),
        h('div', { class: 'segs', role: 'group', 'aria-label': 'Language' }, langBtn('en', 'English'), langBtn('ne', 'नेपाली'), langBtn('bn', 'বাংলা'))),
      h('div', { class: 'notice' },
        h('strong', {}, 'Demo. '),
        'All people and cases are made up. No AI model is connected: answers come from the agent’s built-in templates and drafts are scripted. The safety rules, attorney review and urgent escalation are the real code from the project.'),
      h('div', { class: 'top-row' },
        h('div', { class: 'segs pane-switch', role: 'group', 'aria-label': 'View' }, paneBtn('client', 'Client app'), paneBtn('firm', 'Firm side', openCount)),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', id: 'show-trace', checked: state.showTrace, onchange: (e: Event) => { state.showTrace = (e.target as HTMLInputElement).checked; void render(); } }), h('span', {}, 'Show what the agent did')))),
    h('main', { class: `layout pane-${state.pane}` }, renderClient(), firm),
  );
  window.scrollTo({ top: scrollY });
  scrollChat();
  if (state.toast) setTimeout(() => { state.toast = ''; }, 0);
}

void startConversation();
