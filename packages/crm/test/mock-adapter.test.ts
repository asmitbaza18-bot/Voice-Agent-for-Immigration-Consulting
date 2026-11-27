import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptField, ENCRYPTED_COLUMNS, isEncrypted, maskANumber, parseKeyRing } from '@chhetry/db';
import type { IntakeRecord } from '@chhetry/shared';
import { CrmNotFoundError, MockCrmAdapter, type CrmAdapter } from '../src/index.js';

const keyRing = parseKeyRing(`k1:${randomBytes(32).toString('base64')}`);
const hmacKey = randomBytes(32);
let crm: MockCrmAdapter;
let n = 0;

beforeEach(() => {
  n = 0;
  crm = new MockCrmAdapter({ keyRing, hmacKey, idFactory: () => String(++n) });
});

describe('MockCrmAdapter seed (Sharma family)', () => {
  it('implements CrmAdapter', () => {
    const asInterface: CrmAdapter = crm;
    expect(asInterface).toBeDefined();
  });

  it("has Sita's removal case and I-130 RFE", async () => {
    const sita = await crm.findPerson({ email: 'SITA.SHARMA@example.com' });
    expect(sita?.fullName).toBe('Sita Sharma');
    const cases = await crm.getCases(sita!.id);
    expect(cases.map((c) => [c.type, c.status])).toEqual([['removal_proceedings', 'open'], ['I-130', 'rfe']]);
    const rfe = cases.find((c) => c.type === 'I-130')!;
    expect(rfe.keyDates.find((d) => d.label === 'RFE response due')?.date).toBe('2027-01-15');
  });

  it("has Ram's I-485 interview and approved I-765", async () => {
    const ram = await crm.findPerson({ phone: '(212) 555-0143' });
    const cases = await crm.getCases(ram!.id);
    expect(cases.map((c) => [c.type, c.status])).toEqual([['I-485', 'pending'], ['I-765', 'approved']]);
    expect(cases[0]!.keyDates.find((d) => d.label === 'Interview')?.date).toBe('2027-01-08');
  });

  it('stores A-numbers encrypted and finds by A-number via blind index', async () => {
    const sita = await crm.findPerson({ aNumber: 'A-200-000-101' });
    expect(sita?.id).toBe('per_sita_sharma');
    expect(isEncrypted(sita!.aNumber)).toBe(true);
    expect(JSON.stringify(sita)).not.toContain('200000101');
    expect(maskANumber(decryptField(sita!.aNumber!, ENCRYPTED_COLUMNS.personANumber, keyRing))).toBe('A-***-***-101');
    expect(JSON.stringify(sita)).not.toContain('aNumberHash');
  });

  it('returns documents including missing ones', async () => {
    const docs = await crm.getDocuments('per_sita_sharma');
    expect(docs.some((d) => d.kind === 'rfe')).toBe(true);
    expect(docs.filter((d) => d.status === 'missing').map((d) => d.title)).toEqual(['Passport biographic page']);
  });

  it('returns copies, not internal state', async () => {
    const cases = await crm.getCases('per_ram_sharma');
    cases[0]!.status = 'denied';
    expect((await crm.getCases('per_ram_sharma'))[0]!.status).toBe('pending');
  });

  it('returns null for unknown people and throws for unknown ids', async () => {
    expect(await crm.findPerson({ phone: '+15555550199' })).toBeNull();
    expect(await crm.findPerson({})).toBeNull();
    await expect(crm.getCases('nope')).rejects.toBeInstanceOf(CrmNotFoundError);
  });
});

describe('MockCrmAdapter writes', () => {
  it('creates a person, matter, intake, transcript and task', async () => {
    const p = await crm.upsertPersonWithANumber({ fullName: 'New Client', preferredLang: 'bn', smsConsent: false }, 'A098765432');
    expect(p.id).toBe('per_1');
    expect((await crm.findPerson({ aNumber: 'A098765432' }))?.id).toBe('per_1');

    const { matterId } = await crm.createMatter(p.id, 'family');
    const intake: IntakeRecord = {
      id: 'int_1', conversationId: 'conv_1', goal: 'family',
      modules: { core: { city: 'Queens' } }, uncertainFields: [], discussWithAttorney: ['red_flags.arrests_charges_convictions'], documents: [],
    };
    await crm.writeIntake(matterId, intake);
    await crm.attachTranscript(matterId, 'blob://t1', 'Intake summary');
    await crm.createTask(matterId, { title: 'Review intake', assignee: 'atty_chhetry' });

    const m = crm.getMatter(matterId)!;
    expect(m.intakes).toHaveLength(1);
    expect(m.transcripts[0]?.ref).toBe('blob://t1');
    expect(m.tasks[0]?.title).toBe('Review intake');
  });

  it('updates an existing person without losing fields', async () => {
    const p = await crm.upsertPerson({ id: 'per_ram_sharma', city: 'Jackson Heights' });
    expect(p.fullName).toBe('Ram Sharma');
    expect(p.city).toBe('Jackson Heights');
  });

  it('requires a name for new people and a known matter for writes', async () => {
    await expect(crm.upsertPerson({ phone: '+12125550100' })).rejects.toThrow(/fullName/);
    await expect(crm.createTask('mat_x', { title: 't' })).rejects.toBeInstanceOf(CrmNotFoundError);
  });
});
