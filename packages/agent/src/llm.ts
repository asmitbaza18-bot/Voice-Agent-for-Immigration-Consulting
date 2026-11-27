import Anthropic from '@anthropic-ai/sdk';

/**
 * Provider-neutral LLM boundary (CLAUDE.md section 3). The agent only needs
 * plain completions in Milestone 1: the orchestrator is code-driven, and the
 * LLM writes answer text and labels; it does not pick states or call tools.
 */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** Stable system prompt (attorney-reviewed). */
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  /** For logs and audit: which prompt produced this. */
  purpose: 'answer_from_file' | 'classify' | 'draft_for_attorney';
}

export interface LlmResponse {
  text: string;
  model: string;
  /** True when the provider declined to answer. */
  refused?: boolean;
}

export interface LlmAdapter {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** Scripted adapter for tests. No network. Records every request it was given. */
export class FakeLlmAdapter implements LlmAdapter {
  readonly name = 'fake';
  readonly requests: LlmRequest[] = [];
  constructor(private readonly respond: (req: LlmRequest) => string | Promise<string>) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(structuredClone(req));
    return { text: await this.respond(req), model: 'fake' };
  }
}

export interface AnthropicAdapterOptions {
  /** Defaults to ANTHROPIC_API_KEY or another credential the SDK resolves. */
  apiKey?: string;
  model?: string;
  /** Inject a client for tests. */
  client?: Anthropic;
}

/**
 * Anthropic Claude adapter. Vendor terms must be no-training and US-region
 * (guardrail 9); that is a contract and account setting, checked in the vendor
 * review, not something this code can enforce. `inference_geo: 'us'` keeps
 * inference in the US where supported.
 */
export class AnthropicLlmAdapter implements LlmAdapter {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicAdapterOptions = {}) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    // Server-side refusal fallback: if the model declines, the API retries on a fallback model in the same call.
    const res = await this.client.beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: this.model,
      max_tokens: req.maxTokens ?? (req.purpose === 'classify' ? 256 : 2000),
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: { effort: req.purpose === 'classify' ? 'low' : 'medium' },
      inference_geo: 'us',
    });
    if (res.stop_reason === 'refusal') return { text: '', model: res.model, refused: true };
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    return { text, model: res.model };
  }
}
