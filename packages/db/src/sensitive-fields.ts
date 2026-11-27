/**
 * Single list of encrypted columns and the AAD context each one uses.
 * Repositories must go through these constants so contexts never drift.
 */
export const ENCRYPTED_COLUMNS = {
  personANumber: 'Person.aNumberEnc',
  personImmigrationStatus: 'Person.immigrationStatusEnc',
  conversationTranscriptRef: 'Conversation.transcriptRefEnc',
  conversationSummary: 'Conversation.summaryEnc',
  intakeSensitiveModules: 'IntakeRecord.sensitiveModulesEnc',
  assessmentRedFlags: 'Assessment.redFlagsEnc',
  assessmentMemo: 'Assessment.memoMarkdownEnc',
  reviewQuestion: 'ReviewItem.questionEnc',
  reviewAiDraft: 'ReviewItem.aiDraftEnc',
  reviewFinalText: 'ReviewItem.finalTextEnc',
} as const;

/** Intake fields whose answers go into IntakeRecord.sensitiveModulesEnc, never plain `modules`. */
export const SENSITIVE_INTAKE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  history: ['a_number', 'current_status', 'status_expiry', 'prior_court_or_removal', 'denials'],
  humanitarian: ['fear_of_return', 'harm_source', 'crime_victim', 'police_cooperation', 'trafficking', 'abuse_by_usc_lpr_relative', 'under_21_abused_abandoned'],
  red_flags: ['arrests_charges_convictions', 'false_documents', 'misrepresentation', 'false_claim_citizenship', 'unauthorized_work'],
  naturalization: ['false_claim_or_voting'],
} as const;

export function isSensitiveIntakeField(module: string, field: string): boolean {
  if (module === 'red_flags') return true;
  return SENSITIVE_INTAKE_FIELDS[module]?.includes(field) ?? false;
}
