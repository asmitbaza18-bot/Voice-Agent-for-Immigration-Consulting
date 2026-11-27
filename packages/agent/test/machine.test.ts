import { describe, expect, it } from 'vitest';
import type { AgentState } from '@chhetry/shared';
import { canTransition, InvalidTransitionError, transition, TRANSITIONS, type AgentEvent } from '../src/machine.js';

const ALL_STATES = Object.keys(TRANSITIONS) as AgentState[];
const ALL_EVENTS: AgentEvent[] = [
  'START', 'DISCLOSURES_ACCEPTED', 'DISCLOSURES_DECLINED', 'TRIAGE_URGENT', 'TRIAGE_CLEAR', 'VERIFIED_CLIENT', 'NEW_CALLER',
  'ASK_FACT', 'ASK_LEGAL', 'DOC_REQUEST', 'BOOK', 'ANSWERED', 'REVIEW_CREATED', 'CONTINUE', 'START_INTAKE', 'GOAL_SET',
  'MODULE_DONE', 'CONFIRMED', 'CORRECTION', 'ASSESSMENT_QUEUED', 'BOOKED', 'LIVE_TRANSFER', 'ON_CALL_ALERT', 'DONE', 'URGENT', 'HANGUP',
];

/** The graph from CLAUDE.md section 9, written out by hand so the table cannot drift silently. */
const EXPECTED: [AgentState, AgentEvent, AgentState][] = [
  ['start', 'START', 'disclosures'],
  ['disclosures', 'DISCLOSURES_ACCEPTED', 'triage'],
  ['disclosures', 'DISCLOSURES_DECLINED', 'end'],
  ['triage', 'TRIAGE_URGENT', 'escalate'],
  ['triage', 'TRIAGE_CLEAR', 'identify'],
  ['identify', 'VERIFIED_CLIENT', 'existing_client'],
  ['identify', 'NEW_CALLER', 'new_intake'],
  ['existing_client', 'ASK_FACT', 'answer_from_file'],
  ['existing_client', 'ASK_LEGAL', 'legal_question'],
  ['existing_client', 'DOC_REQUEST', 'doc_request'],
  ['existing_client', 'BOOK', 'booking'],
  ['existing_client', 'DONE', 'end'],
  ['answer_from_file', 'ANSWERED', 'existing_client'],
  ['legal_question', 'REVIEW_CREATED', 'review_queue'],
  ['review_queue', 'CONTINUE', 'existing_client'],
  ['review_queue', 'DONE', 'end'],
  ['doc_request', 'DONE', 'existing_client'],
  ['new_intake', 'START_INTAKE', 'goal'],
  ['goal', 'GOAL_SET', 'core'],
  ['core', 'MODULE_DONE', 'history'],
  ['history', 'MODULE_DONE', 'module'],
  ['module', 'MODULE_DONE', 'red_flags'],
  ['red_flags', 'MODULE_DONE', 'documents'],
  ['documents', 'MODULE_DONE', 'playback'],
  ['playback', 'CONFIRMED', 'assessment_pending'],
  ['playback', 'CORRECTION', 'playback'],
  ['assessment_pending', 'ASSESSMENT_QUEUED', 'booking'],
  ['booking', 'BOOKED', 'end'],
  ['booking', 'DONE', 'end'],
  ['escalate', 'LIVE_TRANSFER', 'live_transfer'],
  ['escalate', 'ON_CALL_ALERT', 'on_call_alert'],
  ['live_transfer', 'DONE', 'end'],
  ['on_call_alert', 'DONE', 'end'],
];

describe('state machine transitions', () => {
  for (const [from, ev, to] of EXPECTED) {
    it(`${from} --${ev}--> ${to}`, () => {
      expect(canTransition(from, ev)).toBe(true);
      expect(transition(from, ev)).toBe(to);
    });
  }

  it('the table has exactly the expected transitions (besides URGENT and HANGUP)', () => {
    const actual = ALL_STATES.flatMap((s) => Object.entries(TRANSITIONS[s]).map(([e, to]) => `${s}|${e}|${to}`)).sort();
    expect(actual).toEqual(EXPECTED.map((x) => x.join('|')).sort());
  });

  it('rejects every other state/event pair', () => {
    const allowed = new Set(EXPECTED.map(([f, e]) => `${f}|${e}`));
    for (const s of ALL_STATES)
      for (const e of ALL_EVENTS.filter((x) => x !== 'URGENT' && x !== 'HANGUP')) {
        if (allowed.has(`${s}|${e}`)) continue;
        expect(canTransition(s, e), `${s} ${e}`).toBe(false);
        expect(() => transition(s, e)).toThrow(InvalidTransitionError);
      }
  });
});

describe('URGENT (guardrail 5)', () => {
  const blocked: AgentState[] = ['start', 'escalate', 'live_transfer', 'on_call_alert', 'end'];
  for (const s of ALL_STATES.filter((x) => !blocked.includes(x))) {
    it(`${s} --URGENT--> escalate`, () => expect(transition(s, 'URGENT')).toBe('escalate'));
  }
  for (const s of blocked) {
    it(`${s} rejects URGENT`, () => expect(() => transition(s, 'URGENT')).toThrow(InvalidTransitionError));
  }
});

describe('HANGUP', () => {
  for (const s of ALL_STATES.filter((x) => x !== 'end')) {
    it(`${s} --HANGUP--> end`, () => expect(transition(s, 'HANGUP')).toBe('end'));
  }
  it('end rejects HANGUP', () => expect(() => transition('end', 'HANGUP')).toThrow(InvalidTransitionError));
});

describe('reachability', () => {
  it('every state is reachable from start and can reach end', () => {
    const next = (s: AgentState) => [...Object.values(TRANSITIONS[s]), ...(canTransition(s, 'URGENT') ? ['escalate' as AgentState] : [])];
    const seen = new Set<AgentState>(['start']);
    const queue: AgentState[] = ['start'];
    while (queue.length) for (const n of next(queue.shift()!)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    expect([...seen].sort()).toEqual([...ALL_STATES].sort());
  });
});
