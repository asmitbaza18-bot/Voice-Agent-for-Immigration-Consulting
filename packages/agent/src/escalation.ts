import { randomUUID } from 'node:crypto';
import type { Channel, UrgentFlag } from '@chhetry/shared';
import type { AuditSink } from '@chhetry/db';

export interface EscalationRequest {
  conversationId: string;
  personId?: string;
  channel: Channel;
  flags: UrgentFlag[];
  matchedPatterns?: string[];
}

export interface Escalation extends EscalationRequest {
  id: string;
  mode: 'live_transfer' | 'on_call_alert';
  createdAt: string;
}

/**
 * Urgent escalation (guardrail 5). Phone calls will live-transfer once the
 * Twilio line exists (Milestone 2); until then every channel raises an
 * on-call alert. Who is on call, and how they are paged, is a firm decision
 * (SMS, phone tree); this interface is where that plugs in.
 */
export interface EscalationService {
  escalate(req: EscalationRequest): Promise<Escalation>;
  list(): Promise<Escalation[]>;
}

export class InMemoryEscalationService implements EscalationService {
  private readonly rows: Escalation[] = [];
  constructor(private readonly deps: { audit: AuditSink; now?: () => Date; liveTransferAvailable?: boolean }) {}

  async escalate(req: EscalationRequest): Promise<Escalation> {
    const e: Escalation = {
      ...req,
      id: `esc_${randomUUID()}`,
      mode: req.channel === 'phone' && this.deps.liveTransferAvailable ? 'live_transfer' : 'on_call_alert',
      createdAt: (this.deps.now ?? (() => new Date()))().toISOString(),
    };
    this.rows.push(e);
    this.deps.audit.write({ actorType: 'agent', action: 'escalation.create', entityType: 'Conversation', entityId: req.conversationId, metadata: { flags: req.flags, mode: e.mode, patterns: req.matchedPatterns ?? [] } });
    return structuredClone(e);
  }

  async list(): Promise<Escalation[]> {
    return structuredClone(this.rows);
  }
}
