// Source language. Every key here must exist in ne.ts and bn.ts (enforced by types and tests).
// Disclaimer wording must be approved by the firm's attorney and ethics counsel before pilot (Milestone 4).
export const en = {
  'disclosure.ai': 'I am the Chhetry Law assistant. I am an AI, not a person.',
  'disclosure.recording_consent':
    'This conversation is recorded and saved to your file so the legal team can review it. Do you agree to be recorded?',
  'disclosure.info_not_advice':
    'I can share general information and facts from your file. This is not legal advice. An attorney will review your information.',
  'disclosure.confidentiality': 'What you share is kept confidential and is only seen by the Chhetry Law team.',
  'disclosure.confirm': 'Do you understand, and do you want to continue?',
  'label.facts_not_advice': 'Facts from your file only, not legal advice',
  'agent.legal_question_routed': 'That question needs your attorney. I have sent it to them, and they will answer you.',
  'agent.not_in_file': "I don't see that in your file. I will ask the team and get back to you.",
  'agent.urgent_escalation': 'This sounds urgent. I am connecting you to our team now.',
  'agent.read_aloud_offer': 'Would you like me to read this aloud?',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
