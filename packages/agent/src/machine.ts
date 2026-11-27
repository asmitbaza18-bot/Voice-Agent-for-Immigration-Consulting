import type { AgentState } from '@chhetry/shared';

/**
 * Dialog state machine (CLAUDE.md section 9). A pure reducer: no I/O, no LLM.
 * The LLM never chooses a state; code does, from typed events.
 */
export type AgentEvent =
  | 'START'
  | 'DISCLOSURES_ACCEPTED' | 'DISCLOSURES_DECLINED'
  | 'TRIAGE_URGENT' | 'TRIAGE_CLEAR'
  | 'VERIFIED_CLIENT' | 'NEW_CALLER'
  | 'ASK_FACT' | 'ASK_LEGAL' | 'DOC_REQUEST' | 'BOOK'
  | 'ANSWERED' | 'REVIEW_CREATED' | 'CONTINUE'
  | 'START_INTAKE' | 'GOAL_SET' | 'MODULE_DONE'
  | 'CONFIRMED' | 'CORRECTION' | 'ASSESSMENT_QUEUED' | 'BOOKED'
  | 'LIVE_TRANSFER' | 'ON_CALL_ALERT'
  | 'DONE'
  /** Any urgent signal in any turn (guardrail 5). */
  | 'URGENT'
  /** Caller left or the session closed. */
  | 'HANGUP';

export const TRANSITIONS: Readonly<Record<AgentState, Readonly<Partial<Record<AgentEvent, AgentState>>>>> = {
  start: { START: 'disclosures' },
  disclosures: { DISCLOSURES_ACCEPTED: 'triage', DISCLOSURES_DECLINED: 'end' },
  triage: { TRIAGE_URGENT: 'escalate', TRIAGE_CLEAR: 'identify' },
  identify: { VERIFIED_CLIENT: 'existing_client', NEW_CALLER: 'new_intake' },
  existing_client: { ASK_FACT: 'answer_from_file', ASK_LEGAL: 'legal_question', DOC_REQUEST: 'doc_request', BOOK: 'booking', DONE: 'end' },
  answer_from_file: { ANSWERED: 'existing_client' },
  legal_question: { REVIEW_CREATED: 'review_queue' },
  review_queue: { CONTINUE: 'existing_client', DONE: 'end' },
  doc_request: { DONE: 'existing_client' },
  new_intake: { START_INTAKE: 'goal' },
  goal: { GOAL_SET: 'core' },
  core: { MODULE_DONE: 'history' },
  history: { MODULE_DONE: 'module' },
  module: { MODULE_DONE: 'red_flags' },
  red_flags: { MODULE_DONE: 'documents' },
  documents: { MODULE_DONE: 'playback' },
  playback: { CONFIRMED: 'assessment_pending', CORRECTION: 'playback' },
  assessment_pending: { ASSESSMENT_QUEUED: 'booking' },
  booking: { BOOKED: 'end', DONE: 'end' },
  escalate: { LIVE_TRANSFER: 'live_transfer', ON_CALL_ALERT: 'on_call_alert' },
  live_transfer: { DONE: 'end' },
  on_call_alert: { DONE: 'end' },
  end: {},
};

/** States where an urgent signal is already being handled, or the conversation is over. */
const NO_URGENT_FROM: ReadonlySet<AgentState> = new Set(['start', 'escalate', 'live_transfer', 'on_call_alert', 'end']);

export class InvalidTransitionError extends Error {
  override name = 'InvalidTransitionError';
  constructor(readonly from: AgentState, readonly event: AgentEvent) {
    super(`No transition from ${from} on ${event}`);
  }
}

export function canTransition(from: AgentState, event: AgentEvent): boolean {
  if (event === 'URGENT') return !NO_URGENT_FROM.has(from);
  if (event === 'HANGUP') return from !== 'end';
  return TRANSITIONS[from][event] !== undefined;
}

export function transition(from: AgentState, event: AgentEvent): AgentState {
  if (event === 'URGENT') {
    if (NO_URGENT_FROM.has(from)) throw new InvalidTransitionError(from, event);
    return 'escalate';
  }
  if (event === 'HANGUP') {
    if (from === 'end') throw new InvalidTransitionError(from, event);
    return 'end';
  }
  const to = TRANSITIONS[from][event];
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

/** States that collect intake answers, mapped to how the service fills them. */
export const INTAKE_STATES = ['core', 'history', 'module', 'red_flags', 'documents'] as const satisfies readonly AgentState[];
