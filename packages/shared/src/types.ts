// Core data model. Source: CLAUDE.md section 6.

export type Lang = 'en' | 'ne' | 'bn';
export const LANGS: readonly Lang[] = ['en', 'ne', 'bn'] as const;

export type Channel = 'app' | 'phone' | 'web';

export type Role = 'client' | 'staff' | 'attorney' | 'management' | 'admin' | 'super_admin';

/**
 * Ciphertext produced by @chhetry/db encryptField. The brand stops plaintext
 * strings from being assigned to sensitive fields by accident.
 * Format: `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>` (base64url parts).
 */
export type EncryptedString = string & { readonly __brand: 'EncryptedString' };

export interface Person {
  id: string;
  fullName: string;
  otherNames?: string[];
  phone?: string;
  email?: string;
  smsConsent: boolean;
  preferredLang: Lang;
  aNumber?: EncryptedString; // masked in UI
  countryOfBirth?: string;
  citizenships?: string[];
  state?: string;
  city?: string;
}

/** Dialog states. Source: CLAUDE.md section 9. */
export type AgentState =
  | 'start' | 'disclosures' | 'triage' | 'escalate' | 'identify'
  | 'existing_client' | 'answer_from_file' | 'legal_question' | 'doc_request' | 'booking'
  | 'new_intake' | 'goal' | 'core' | 'history' | 'module' | 'red_flags' | 'documents'
  | 'playback' | 'assessment_pending' | 'review_queue' | 'live_transfer' | 'on_call_alert' | 'end';

export type UrgentFlag =
  | 'detained' | 'hearing_within_7_days' | 'removal_order' | 'ice_contact'
  | 'deadline_within_14_days' | 'stuck_abroad' | 'danger';

export interface Conversation {
  id: string;
  channel: Channel;
  lang: Lang;
  personId?: string;
  startedAt: string;
  disclosuresAccepted: boolean;
  recordingConsent: boolean;
  urgentFlags: UrgentFlag[];
  state: AgentState;
  transcriptRef: string; // encrypted blob
  summary?: string;
}

export type Goal = 'family' | 'employment' | 'humanitarian' | 'removal_defense'
  | 'naturalization' | 'status_question' | 'other';

export type ModuleId = 'core' | 'history' | 'family' | 'employment'
  | 'humanitarian' | 'removal' | 'naturalization' | 'red_flags' | 'documents';

/** A typed intake answer. `discuss_with_attorney` records a sensitive question the caller chose not to answer. */
export type FieldValue =
  | string | number | boolean | null
  | string[]
  | { kind: 'date'; value: string }
  | { kind: 'encrypted'; value: EncryptedString }
  | { kind: 'discuss_with_attorney' };

export type DocumentKind =
  | 'passport' | 'i94' | 'visa' | 'i797_notice' | 'ead' | 'green_card' | 'court_notice'
  | 'rfe' | 'interview_notice' | 'police_court_record' | 'marriage_cert' | 'birth_cert' | 'other';

export interface DocumentRef {
  id: string;
  personId: string;
  caseId?: string;
  kind: DocumentKind;
  title: string;
  receivedAt?: string;
  storageRef?: string; // pointer into the encrypted document store
  status: 'received' | 'missing' | 'requested';
}

export interface IntakeRecord {
  id: string;
  conversationId: string;
  goal: Goal;
  modules: Partial<Record<ModuleId, Record<string, FieldValue>>>;
  uncertainFields: string[]; // caller unsure
  discussWithAttorney: string[]; // sensitive items the caller preferred not to answer
  documents: DocumentRef[];
}

export interface Assessment {
  id: string;
  intakeId: string;
  pathways: { code: string; label: string; confidence: 'low' | 'medium' | 'high'; dependsOn: string[] }[];
  redFlags: { code: string; note: string; ruleId: string }[];
  deadlines: { label: string; date: string; ruleId: string }[];
  documentChecklist: { item: string; have: boolean }[];
  memoMarkdown: string;
  rulesVersion: string;
  status: 'pending_review' | 'approved' | 'edited' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ReviewItem {
  id: string;
  kind: 'assessment' | 'legal_question';
  personId: string;
  question?: string; // for legal_question
  aiDraft: string;
  status: 'open' | 'approved' | 'edited_sent' | 'call_client' | 'rejected';
  attorneyId?: string;
}

/** Case summary returned by the CRM (CLAUDE.md section 11). */
export interface CaseStep {
  label: string;
  date?: string;
  status: 'done' | 'upcoming' | 'action_needed';
}

export interface CaseSummary {
  id: string;
  personId: string;
  type: string; // e.g. 'I-130', 'I-485', 'I-765', 'removal_proceedings'
  title: string;
  receiptNumber?: string;
  status: 'open' | 'pending' | 'rfe' | 'approved' | 'denied' | 'closed';
  keyDates: { label: string; date: string }[];
  steps: CaseStep[];
  missingDocuments: string[];
  attorneyId?: string;
}
