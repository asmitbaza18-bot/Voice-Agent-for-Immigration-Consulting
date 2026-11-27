/**
 * Provider-neutral voice interfaces (CLAUDE.md section 3, "Provider-agnostic").
 * No vendor is chosen yet; see docs/decisions/0003-voice-provider-neutral.md.
 * The first adapter lands in Milestone 2 after the Nepali/Bengali comparison.
 */
import type { Lang } from '@chhetry/shared';

export type AudioEncoding = 'pcm16' | 'mulaw' | 'opus';

export interface AudioFormat {
  encoding: AudioEncoding;
  sampleRateHz: 8000 | 16000 | 24000 | 48000;
  channels: 1;
}

export interface AudioChunk {
  data: Uint8Array;
  format: AudioFormat;
  /** Milliseconds since the start of the stream. */
  timestampMs: number;
}

/** Guardrail 9: what every voice, speech and telephony vendor must guarantee. */
export interface VendorCompliance {
  vendor: string;
  /** Contractual no-training / zero data retention terms in place. */
  noTrainingOnCustomerData: boolean;
  /** Processing and storage region. */
  dataRegion: 'us' | 'eu' | 'other';
  /** Reference to the signed terms (DPA/BAA id or doc link), for audit. */
  termsRef: string;
}

export interface Transcript {
  text: string;
  lang: Lang | 'unknown';
  /** 0..1 when the vendor provides it. */
  confidence?: number;
  isFinal: boolean;
  startMs?: number;
  endMs?: number;
}

export interface LanguageDetection {
  lang: Lang | 'unknown';
  confidence: number;
}

export interface SttOptions {
  /** Expected languages; adapters should restrict detection to these. */
  langs: readonly Lang[];
  format: AudioFormat;
  /** Domain phrases to bias recognition (case types, form numbers, place names). */
  hints?: readonly string[];
}

export interface SpeechToText {
  readonly compliance: VendorCompliance;
  transcribe(audio: AsyncIterable<AudioChunk>, opts: SttOptions): AsyncIterable<Transcript>;
  detectLanguage?(audio: AsyncIterable<AudioChunk>, langs: readonly Lang[]): Promise<LanguageDetection>;
}

export interface TtsOptions {
  lang: Lang;
  voiceId?: string;
  /** 0.5..2, 1 is normal. Slower helps read-aloud of letters. */
  rate?: number;
  format: AudioFormat;
}

export interface TextToSpeech {
  readonly compliance: VendorCompliance;
  synthesize(text: string, opts: TtsOptions): AsyncIterable<AudioChunk>;
  listVoices?(lang: Lang): Promise<{ id: string; label: string }[]>;
}

/** Events a realtime (duplex) session emits to the orchestrator. */
export type RealtimeEvent =
  | { type: 'transcript'; role: 'caller' | 'agent'; transcript: Transcript }
  | { type: 'audio'; chunk: AudioChunk }
  | { type: 'language_detected'; detection: LanguageDetection }
  | { type: 'barge_in' }
  | { type: 'error'; code: string; retryable: boolean }
  | { type: 'closed'; reason: 'caller_hangup' | 'agent_end' | 'transfer' | 'error' | 'timeout' };

export interface RealtimeSessionConfig {
  sessionId: string;
  lang: Lang;
  allowedLangs: readonly Lang[];
  inputFormat: AudioFormat;
  outputFormat: AudioFormat;
  /** Whether the caller accepted recording (guardrail 6). Adapters must not persist audio when false. */
  recordingConsent: boolean;
}

export interface RealtimeSession {
  readonly id: string;
  sendAudio(chunk: AudioChunk): Promise<void>;
  /** Speak text produced by the orchestrator (already checked by guardrails). */
  say(text: string, opts?: { lang?: Lang; interruptible?: boolean }): Promise<void>;
  setLanguage(lang: Lang): Promise<void>;
  events(): AsyncIterable<RealtimeEvent>;
  close(): Promise<void>;
}

/**
 * Realtime adapters carry audio only. The orchestrator (packages/agent) owns
 * dialog, tools and guardrails, so a vendor's own LLM must not answer callers
 * directly; text reaches the caller only through `say`.
 */
export interface RealtimeVoiceAdapter {
  readonly compliance: VendorCompliance;
  readonly supportedLangs: readonly Lang[];
  startSession(config: RealtimeSessionConfig): Promise<RealtimeSession>;
}
