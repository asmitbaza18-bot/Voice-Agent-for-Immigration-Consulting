/**
 * Seed data matching the UI prototype: the Sharma family.
 * - Sita Sharma: removal proceedings, and an I-130 with an open RFE.
 * - Ram Sharma: I-485 with an interview scheduled, and an approved I-765.
 *
 * ALL DATA IS FICTIONAL. Phone numbers use the 555-01xx range, A-numbers and
 * receipt numbers are made up, emails use example.com.
 */
import type { CaseSummary, DocumentRef } from '@chhetry/shared';

export interface SeedPerson {
  id: string;
  fullName: string;
  otherNames?: string[];
  phone: string;
  email: string;
  smsConsent: boolean;
  preferredLang: 'en' | 'ne' | 'bn';
  /** Plaintext only inside the seed; the mock encrypts it on load. */
  aNumberPlain: string;
  countryOfBirth: string;
  citizenships: string[];
  state: string;
  city: string;
}

export const SEED_PEOPLE: readonly SeedPerson[] = [
  {
    id: 'per_sita_sharma',
    fullName: 'Sita Sharma',
    phone: '+12125550142',
    email: 'sita.sharma@example.com',
    smsConsent: true,
    preferredLang: 'ne',
    aNumberPlain: 'A200000101',
    countryOfBirth: 'NP',
    citizenships: ['NP'],
    state: 'NY',
    city: 'New York',
  },
  {
    id: 'per_ram_sharma',
    fullName: 'Ram Sharma',
    phone: '+12125550143',
    email: 'ram.sharma@example.com',
    smsConsent: true,
    preferredLang: 'en',
    aNumberPlain: 'A200000102',
    countryOfBirth: 'NP',
    citizenships: ['NP'],
    state: 'NY',
    city: 'New York',
  },
];

export const SEED_CASES: readonly CaseSummary[] = [
  {
    id: 'case_sita_removal',
    personId: 'per_sita_sharma',
    type: 'removal_proceedings',
    title: 'Removal proceedings (Immigration Court)',
    status: 'open',
    keyDates: [
      { label: 'Notice to Appear served', date: '2025-08-12' },
      { label: 'Master calendar hearing', date: '2027-02-18' },
    ],
    steps: [
      { label: 'Notice to Appear received', date: '2025-08-12', status: 'done' },
      { label: 'Attorney entered appearance', date: '2025-09-03', status: 'done' },
      { label: 'Master calendar hearing', date: '2027-02-18', status: 'upcoming' },
    ],
    missingDocuments: ['Copy of passport biographic page'],
    attorneyId: 'atty_chhetry',
  },
  {
    id: 'case_sita_i130',
    personId: 'per_sita_sharma',
    type: 'I-130',
    title: 'I-130 Petition for Alien Relative',
    receiptNumber: 'IOE0900000101',
    status: 'rfe',
    keyDates: [
      { label: 'Filed', date: '2026-03-20' },
      { label: 'RFE issued', date: '2026-10-16' },
      { label: 'RFE response due', date: '2027-01-15' },
    ],
    steps: [
      { label: 'Petition filed', date: '2026-03-20', status: 'done' },
      { label: 'Receipt notice', date: '2026-03-27', status: 'done' },
      { label: 'Request for Evidence received', date: '2026-10-16', status: 'done' },
      { label: 'Send RFE documents to the firm', date: '2026-12-15', status: 'action_needed' },
      { label: 'RFE response due to USCIS', date: '2027-01-15', status: 'upcoming' },
    ],
    missingDocuments: ['Joint bank statements (last 12 months)', 'Lease showing both names'],
    attorneyId: 'atty_chhetry',
  },
  {
    id: 'case_ram_i485',
    personId: 'per_ram_sharma',
    type: 'I-485',
    title: 'I-485 Application to Adjust Status',
    receiptNumber: 'MSC2600000102',
    status: 'pending',
    keyDates: [
      { label: 'Filed', date: '2026-02-10' },
      { label: 'Biometrics', date: '2026-04-02' },
      { label: 'Interview', date: '2027-01-08' },
    ],
    steps: [
      { label: 'Application filed', date: '2026-02-10', status: 'done' },
      { label: 'Biometrics appointment', date: '2026-04-02', status: 'done' },
      { label: 'Interview at USCIS field office', date: '2027-01-08', status: 'upcoming' },
    ],
    missingDocuments: ['Updated employment letter'],
    attorneyId: 'atty_chhetry',
  },
  {
    id: 'case_ram_i765',
    personId: 'per_ram_sharma',
    type: 'I-765',
    title: 'I-765 Application for Employment Authorization',
    receiptNumber: 'MSC2600000103',
    status: 'approved',
    keyDates: [
      { label: 'Filed', date: '2026-02-10' },
      { label: 'Approved', date: '2026-10-02' },
    ],
    steps: [
      { label: 'Application filed', date: '2026-02-10', status: 'done' },
      { label: 'Approved; card mailed', date: '2026-10-02', status: 'done' },
    ],
    missingDocuments: [],
    attorneyId: 'atty_chhetry',
  },
];

export const SEED_DOCUMENTS: readonly DocumentRef[] = [
  { id: 'doc_sita_nta', personId: 'per_sita_sharma', caseId: 'case_sita_removal', kind: 'court_notice', title: 'Notice to Appear', receivedAt: '2025-08-12', status: 'received' },
  { id: 'doc_sita_hearing', personId: 'per_sita_sharma', caseId: 'case_sita_removal', kind: 'court_notice', title: 'Notice of Hearing', receivedAt: '2026-09-30', status: 'received' },
  { id: 'doc_sita_passport', personId: 'per_sita_sharma', caseId: 'case_sita_removal', kind: 'passport', title: 'Passport biographic page', status: 'missing' },
  { id: 'doc_sita_i130_receipt', personId: 'per_sita_sharma', caseId: 'case_sita_i130', kind: 'i797_notice', title: 'I-797C Receipt Notice (I-130)', receivedAt: '2026-03-27', status: 'received' },
  { id: 'doc_sita_i130_rfe', personId: 'per_sita_sharma', caseId: 'case_sita_i130', kind: 'rfe', title: 'Request for Evidence (I-130)', receivedAt: '2026-10-16', status: 'received' },
  { id: 'doc_sita_bank', personId: 'per_sita_sharma', caseId: 'case_sita_i130', kind: 'other', title: 'Joint bank statements (last 12 months)', status: 'requested' },
  { id: 'doc_ram_i485_receipt', personId: 'per_ram_sharma', caseId: 'case_ram_i485', kind: 'i797_notice', title: 'I-797C Receipt Notice (I-485)', receivedAt: '2026-02-20', status: 'received' },
  { id: 'doc_ram_interview', personId: 'per_ram_sharma', caseId: 'case_ram_i485', kind: 'interview_notice', title: 'Interview Appointment Notice', receivedAt: '2026-11-10', status: 'received' },
  { id: 'doc_ram_i765_approval', personId: 'per_ram_sharma', caseId: 'case_ram_i765', kind: 'i797_notice', title: 'I-797 Approval Notice (I-765)', receivedAt: '2026-10-02', status: 'received' },
  { id: 'doc_ram_ead', personId: 'per_ram_sharma', caseId: 'case_ram_i765', kind: 'ead', title: 'Employment Authorization Document', receivedAt: '2026-10-14', status: 'received' },
];
