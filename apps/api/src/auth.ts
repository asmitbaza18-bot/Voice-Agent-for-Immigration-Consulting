import { createHash, timingSafeEqual } from 'node:crypto';
import type { Role } from '@chhetry/shared';

export interface Principal {
  id: string;
  role: Role;
  /** Set for clients: the CRM person they are. */
  personId?: string;
}

/**
 * Resolves a bearer token to a principal. The real implementation plugs into
 * the existing app auth (OTP + biometrics on device, CLAUDE.md section 4).
 */
export interface Authenticator {
  authenticate(bearer: string): Promise<Principal | null>;
}

const sha = (s: string) => createHash('sha256').update(s).digest();

/** DEV ONLY. Static tokens from config. Refuses to construct in production. */
export class DevTokenAuthenticator implements Authenticator {
  private readonly entries: { hash: Buffer; principal: Principal }[];

  constructor(tokens: Record<string, Principal>, env: string = process.env.NODE_ENV ?? 'development') {
    if (env === 'production') throw new Error('DevTokenAuthenticator must not be used in production');
    this.entries = Object.entries(tokens).map(([tok, principal]) => ({ hash: sha(tok), principal }));
  }

  async authenticate(bearer: string): Promise<Principal | null> {
    const h = sha(bearer);
    const hit = this.entries.find((e) => timingSafeEqual(e.hash, h));
    return hit ? { ...hit.principal } : null;
  }
}

export const STAFF_ROLES: readonly Role[] = ['staff', 'attorney', 'management', 'admin', 'super_admin'];
/** Who may decide review items. Only attorneys approve advice (guardrail 1). */
export const REVIEW_ROLES: readonly Role[] = ['attorney'];
