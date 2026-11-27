import { NOT_IN_FILE, templateAnswer, type CaseFacts, type LlmAdapter, type LlmRequest, type LlmResponse } from '@chhetry/agent';
import type { Lang } from '@chhetry/shared';

/**
 * Scripted stand-in for the LLM, so the demo runs with no API key and no
 * network. Nothing here is AI output:
 *
 * - answer_from_file: the agent's own deterministic template answerer.
 * - draft_for_attorney: a fixed, cautious reply built from the case facts,
 *   for the attorney to approve, edit or reject.
 *
 * The real AnthropicLlmAdapter plugs into the same interface.
 */
export const DEMO_MODEL = 'scripted demo text, no AI model connected';

function parse(req: LlmRequest): { lang: Lang; facts: CaseFacts; question: string } | null {
  const content = req.messages.at(-1)?.content ?? '';
  const lang = (/^LANGUAGE: (en|ne|bn)/m.exec(content)?.[1] ?? 'en') as Lang;
  const factsMatch = /FACTS \(JSON\):\n([\s\S]*?)\n\n(?:CLIENT )?QUESTION:\n([\s\S]*)$/.exec(content);
  if (!factsMatch) return null;
  try {
    return { lang, facts: JSON.parse(factsMatch[1]!) as CaseFacts, question: factsMatch[2]!.trim() };
  } catch {
    return null;
  }
}

export function scriptedDraft(facts: CaseFacts, today: string): string {
  const open = facts.cases.filter((c) => !['approved', 'denied', 'closed'].includes(c.status));
  const next = facts.cases
    .flatMap((c) => c.steps.filter((s) => s.date && s.date >= today && s.status !== 'done').map((s) => ({ c, s })))
    .sort((a, b) => a.s.date!.localeCompare(b.s.date!))[0];
  const parts = ['Thank you for your question.'];
  if (open.length) parts.push(`I looked at your file. You have ${open.length} open ${open.length === 1 ? 'matter' : 'matters'}: ${open.map((c) => c.title).join('; ')}.`);
  if (next) parts.push(`The next date in your file is ${next.s.label} on ${next.s.date}.`);
  parts.push('I would like to talk this through with you before you make any plans. Our office will call you to set up a time.');
  return parts.join(' ');
}

export class ScriptedDemoLlm implements LlmAdapter {
  readonly name = DEMO_MODEL;
  constructor(private readonly today: () => string) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const p = parse(req);
    if (!p) return { text: NOT_IN_FILE, model: this.name };
    if (req.purpose === 'draft_for_attorney') return { text: scriptedDraft(p.facts, this.today()), model: this.name };
    return { text: templateAnswer(p.facts, p.question, p.lang, this.today()) ?? NOT_IN_FILE, model: this.name };
  }
}
