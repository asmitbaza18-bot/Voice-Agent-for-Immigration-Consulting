import { randomUUID } from 'node:crypto';
import type { CaseSummary, DocumentRef, EncryptedString, Goal, IntakeRecord, Person } from '@chhetry/shared';
import { blindIndex, ENCRYPTED_COLUMNS, encryptField, normalizeANumber, type KeyRing } from '@chhetry/db';
import { CrmNotFoundError, type CrmAdapter } from './adapter.js';
import { SEED_CASES, SEED_DOCUMENTS, SEED_PEOPLE } from './seed.js';

export interface MockCrmOptions {
  keyRing: KeyRing;
  /** 32+ byte key for the A-number blind index. */
  hmacKey: Buffer;
  /** Load the Sharma family seed. Default true. */
  seed?: boolean;
  idFactory?: () => string;
}

interface StoredPerson extends Person {
  aNumberHash?: string;
}

export interface MockMatter {
  matterId: string;
  personId: string;
  goal: Goal;
  intakes: IntakeRecord[];
  transcripts: { ref: string; summary: string }[];
  tasks: { title: string; due?: string; assignee?: string }[];
}

const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '').replace(/^(?!\+)/, '+1');
const normalizeEmail = (e: string) => e.trim().toLowerCase();
const clone = <T>(v: T): T => structuredClone(v);

/** In-memory CrmAdapter for development and tests. Returns copies, never internal state. */
export class MockCrmAdapter implements CrmAdapter {
  private readonly people = new Map<string, StoredPerson>();
  private readonly cases: CaseSummary[] = [];
  private readonly documents: DocumentRef[] = [];
  private readonly matters = new Map<string, MockMatter>();
  private readonly newId: () => string;

  constructor(private readonly opts: MockCrmOptions) {
    this.newId = opts.idFactory ?? (() => randomUUID());
    if (opts.seed !== false) this.loadSeed();
  }

  private hashANumber(a: string): string {
    return blindIndex(normalizeANumber(a), 'aNumber', this.opts.hmacKey);
  }

  private loadSeed() {
    for (const s of SEED_PEOPLE) {
      const { aNumberPlain, ...rest } = s;
      this.people.set(s.id, {
        ...rest,
        aNumber: encryptField(normalizeANumber(aNumberPlain), ENCRYPTED_COLUMNS.personANumber, this.opts.keyRing),
        aNumberHash: this.hashANumber(aNumberPlain),
      });
    }
    this.cases.push(...clone(SEED_CASES as CaseSummary[]));
    this.documents.push(...clone(SEED_DOCUMENTS as DocumentRef[]));
  }

  private toPerson(p: StoredPerson): Person {
    const { aNumberHash: _h, ...person } = p;
    return clone(person);
  }

  async findPerson(query: { phone?: string; email?: string; aNumber?: string }): Promise<Person | null> {
    const all = [...this.people.values()];
    let hit: StoredPerson | undefined;
    if (query.aNumber) {
      const h = this.hashANumber(query.aNumber);
      hit = all.find((p) => p.aNumberHash === h);
    } else if (query.phone) {
      const ph = normalizePhone(query.phone);
      hit = all.find((p) => p.phone && normalizePhone(p.phone) === ph);
    } else if (query.email) {
      const em = normalizeEmail(query.email);
      hit = all.find((p) => p.email && normalizeEmail(p.email) === em);
    }
    return hit ? this.toPerson(hit) : null;
  }

  /**
   * `aNumber` on input must already be ciphertext (EncryptedString). Use
   * `upsertPersonWithANumber` to pass a plaintext A-number from intake.
   */
  async upsertPerson(p: Partial<Person>): Promise<Person> {
    const existing = p.id ? this.people.get(p.id) : undefined;
    if (!existing && !p.fullName) throw new Error('fullName is required to create a person');
    const merged: StoredPerson = {
      smsConsent: false,
      preferredLang: 'en',
      ...existing,
      ...p,
      id: existing?.id ?? p.id ?? `per_${this.newId()}`,
      fullName: p.fullName ?? existing!.fullName,
    };
    this.people.set(merged.id, merged);
    return this.toPerson(merged);
  }

  async upsertPersonWithANumber(p: Partial<Person>, aNumberPlain: string): Promise<Person> {
    const person = await this.upsertPerson({
      ...p,
      aNumber: encryptField(normalizeANumber(aNumberPlain), ENCRYPTED_COLUMNS.personANumber, this.opts.keyRing) as EncryptedString,
    });
    const stored = this.people.get(person.id)!;
    stored.aNumberHash = this.hashANumber(aNumberPlain);
    return person;
  }

  async getCases(personId: string): Promise<CaseSummary[]> {
    this.requirePerson(personId);
    return clone(this.cases.filter((c) => c.personId === personId));
  }

  async getDocuments(personId: string): Promise<DocumentRef[]> {
    this.requirePerson(personId);
    return clone(this.documents.filter((d) => d.personId === personId));
  }

  async createMatter(personId: string, goal: Goal): Promise<{ matterId: string }> {
    this.requirePerson(personId);
    const matterId = `mat_${this.newId()}`;
    this.matters.set(matterId, { matterId, personId, goal, intakes: [], transcripts: [], tasks: [] });
    return { matterId };
  }

  async writeIntake(matterId: string, intake: IntakeRecord): Promise<void> {
    this.requireMatter(matterId).intakes.push(clone(intake));
  }

  async attachTranscript(matterId: string, ref: string, summary: string): Promise<void> {
    this.requireMatter(matterId).transcripts.push({ ref, summary });
  }

  async createTask(matterId: string, task: { title: string; due?: string; assignee?: string }): Promise<void> {
    this.requireMatter(matterId).tasks.push(clone(task));
  }

  /** Test helper: read back what was written to a matter. */
  getMatter(matterId: string): MockMatter | undefined {
    const m = this.matters.get(matterId);
    return m ? clone(m) : undefined;
  }

  private requirePerson(id: string) {
    if (!this.people.has(id)) throw new CrmNotFoundError(`Person ${id} not found`);
  }

  private requireMatter(id: string): MockMatter {
    const m = this.matters.get(id);
    if (!m) throw new CrmNotFoundError(`Matter ${id} not found`);
    return m;
  }
}
