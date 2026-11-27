import type { Lang, UrgentFlag } from '@chhetry/shared';

/**
 * Keyword rules for the input classifier and escalation checker (CLAUDE.md section 10).
 *
 * A pattern fires when, for every group in `allOf`, at least one token appears
 * in the user's text. All languages' patterns run on every turn, because
 * callers often mix Nepali or Bengali with English.
 *
 * ne and bn tokens are MACHINE DRAFTS and need native-speaker review. Prefer
 * adding tokens (over-routing to the attorney is safe) to removing them.
 */

export type InputLabel = 'fact' | 'general_info' | 'legal_question' | 'urgent' | 'off_topic';

export type LegalReason =
  | 'eligibility' | 'should_can' | 'travel' | 'deportation' | 'strategy'
  | 'criminal' | 'self_filing' | 'hearing_or_notice' | 'fees_timeline_policy_undecided';

export interface KeywordPattern {
  id: string;
  lang: Lang;
  label: InputLabel;
  allOf: readonly (readonly string[])[];
  /** For urgent patterns: the flag to raise. */
  urgentFlag?: UrgentFlag;
  /** For legal patterns: why it goes to the attorney. */
  reason?: LegalReason;
}

const SOON_EN = ['tomorrow', 'today', 'tonight', 'this week', 'next week', 'in two days', 'in 2 days', 'in three days', 'in 3 days', 'in a few days', 'this morning', 'this afternoon'];
const SOON_NE = ['भोलि', 'आज', 'यो हप्ता', 'पर्सि', 'अर्को हप्ता', 'केही दिनमा'];
const SOON_BN = ['আগামীকাল', 'আজ', 'এই সপ্তাহে', 'পরশু', 'আগামী সপ্তাহে', 'কয়েক দিনের মধ্যে'];

export const URGENT_PATTERNS: readonly KeywordPattern[] = [
  // detained
  { id: 'en.detained', lang: 'en', label: 'urgent', urgentFlag: 'detained', allOf: [['detained', 'detention', 'in custody', 'locked up', 'detention center']] },
  { id: 'ne.detained', lang: 'ne', label: 'urgent', urgentFlag: 'detained', allOf: [['हिरासत', 'थुनामा', 'थुनिए', 'थुनेको', 'डिटेन']] },
  { id: 'bn.detained', lang: 'bn', label: 'urgent', urgentFlag: 'detained', allOf: [['আটক', 'হেফাজতে', 'ডিটেন']] },
  // ICE contact
  { id: 'en.ice', lang: 'en', label: 'urgent', urgentFlag: 'ice_contact', allOf: [['ice', 'immigration agents', 'immigration officers', 'immigration came', 'immigration raid']] },
  { id: 'ne.ice', lang: 'ne', label: 'urgent', urgentFlag: 'ice_contact', allOf: [['आइस', 'अध्यागमन अधिकारी आए', 'अध्यागमनका मान्छे']] },
  { id: 'bn.ice', lang: 'bn', label: 'urgent', urgentFlag: 'ice_contact', allOf: [['আইস', 'অভিবাসন কর্মকর্তা এসে', 'ইমিগ্রেশন পুলিশ']] },
  // removal order
  { id: 'en.removal_order', lang: 'en', label: 'urgent', urgentFlag: 'removal_order', allOf: [['removal order', 'deportation order', 'order of removal', 'ordered removed', 'deport order', 'final order']] },
  { id: 'en.being_deported', lang: 'en', label: 'urgent', urgentFlag: 'removal_order', allOf: [['being deported', 'deporting me', 'deporting my', 'are deporting', 'getting deported']] },
  { id: 'ne.removal_order', lang: 'ne', label: 'urgent', urgentFlag: 'removal_order', allOf: [['निष्कासन आदेश', 'डिपोर्ट आदेश', 'डिपोर्टको आदेश', 'डिपोर्ट गर्दै', 'डिपोर्ट गर्ने भयो']] },
  { id: 'bn.removal_order', lang: 'bn', label: 'urgent', urgentFlag: 'removal_order', allOf: [['অপসারণ আদেশ', 'ডিপোর্টেশন আদেশ', 'বহিষ্কার আদেশ', 'ডিপোর্ট করে দিচ্ছে', 'ডিপোর্ট করবে']] },
  // hearing soon or missed
  { id: 'en.hearing_soon', lang: 'en', label: 'urgent', urgentFlag: 'hearing_within_7_days', allOf: [['hearing', 'court date', 'court'], SOON_EN] },
  { id: 'en.missed_hearing', lang: 'en', label: 'urgent', urgentFlag: 'hearing_within_7_days', allOf: [['missed', 'did not go', "didn't go", 'could not go', "couldn't go"], ['hearing', 'court']] },
  { id: 'ne.hearing_soon', lang: 'ne', label: 'urgent', urgentFlag: 'hearing_within_7_days', allOf: [['सुनुवाइ', 'सुनवाई', 'पेशी', 'अदालत', 'कोर्ट'], SOON_NE] },
  { id: 'ne.missed_hearing', lang: 'ne', label: 'urgent', urgentFlag: 'hearing_within_7_days', allOf: [['सुनुवाइ', 'पेशी', 'अदालत', 'कोर्ट'], ['छुट्यो', 'छुटेको', 'जान सकिनँ', 'गइनँ']] },
  { id: 'bn.hearing_soon', lang: 'bn', label: 'urgent', urgentFlag: 'hearing_within_7_days', allOf: [['শুনানি', 'আদালত', 'কোর্ট'], SOON_BN] },
  { id: 'bn.missed_hearing', lang: 'bn', label: 'urgent', urgentFlag: 'hearing_within_7_days', allOf: [['শুনানি', 'আদালত', 'কোর্ট'], ['মিস', 'যেতে পারিনি', 'যাইনি']] },
  // deadline soon
  { id: 'en.deadline_soon', lang: 'en', label: 'urgent', urgentFlag: 'deadline_within_14_days', allOf: [['deadline', 'due', 'respond by', 'last day'], SOON_EN] },
  { id: 'ne.deadline_soon', lang: 'ne', label: 'urgent', urgentFlag: 'deadline_within_14_days', allOf: [['समयसीमा', 'म्याद', 'अन्तिम दिन'], SOON_NE] },
  { id: 'bn.deadline_soon', lang: 'bn', label: 'urgent', urgentFlag: 'deadline_within_14_days', allOf: [['সময়সীমা', 'শেষ তারিখ', 'ডেডলাইন', 'শেষ দিন'], SOON_BN] },
  // stuck abroad
  { id: 'en.stuck_abroad', lang: 'en', label: 'urgent', urgentFlag: 'stuck_abroad', allOf: [["can't come back", 'cannot come back', "can't return", 'cannot return', 'not allowed back', 'denied boarding', 'stranded', 'stuck abroad', 'stuck outside', 'stuck in nepal', 'stuck in bangladesh', 'stuck at the airport']] },
  { id: 'ne.stuck_abroad', lang: 'ne', label: 'urgent', urgentFlag: 'stuck_abroad', allOf: [['फर्कन सकिन', 'फर्कन सक्दिन', 'फर्किन सकेको छैन', 'फर्कन दिएन', 'अड्किएको', 'अड्किएँ']] },
  { id: 'bn.stuck_abroad', lang: 'bn', label: 'urgent', urgentFlag: 'stuck_abroad', allOf: [['ফিরতে পারছি না', 'ফিরতে পারছে না', 'ফিরতে দিচ্ছে না', 'আটকে আছি', 'আটকে গেছ']] },
  // danger
  { id: 'en.danger', lang: 'en', label: 'urgent', urgentFlag: 'danger', allOf: [['in danger', 'threaten*', 'going to kill', 'want to kill', 'wants to kill', 'kill me', 'hurt me', 'hurting me', 'beat me', 'beating me', 'hitting me', 'not safe', 'unsafe', 'emergency', 'suicid*', 'kill myself', 'end my life']] },
  { id: 'ne.danger', lang: 'ne', label: 'urgent', urgentFlag: 'danger', allOf: [['खतरा', 'धम्की', 'मार्छ', 'मार्ने', 'मारिदिन्छ', 'कुट्छ', 'कुटपिट', 'असुरक्षित', 'आत्महत्या', 'मर्न मन']] },
  { id: 'bn.danger', lang: 'bn', label: 'urgent', urgentFlag: 'danger', allOf: [['বিপদ', 'হুমকি', 'মেরে ফেল', 'মারধর', 'মারবে', 'অনিরাপদ', 'আত্মহত্যা', 'মরে যেতে']] },
];

export const LEGAL_PATTERNS: readonly KeywordPattern[] = [
  // eligibility and outcomes
  { id: 'en.eligibility', lang: 'en', label: 'legal_question', reason: 'eligibility', allOf: [['eligib*', 'qualif*', 'am i allowed', 'do i have a case', 'chance*', 'will i get', 'will i win', 'will they approve', 'will it be approved', 'approve me', 'likely']] },
  { id: 'ne.eligibility', lang: 'ne', label: 'legal_question', reason: 'eligibility', allOf: [['योग्य', 'योग्यता', 'पाउँछु', 'पाउन सक्छु', 'पाउँछ कि', 'सम्भावना', 'जित्छु', 'स्वीकृत हुन्छ']] },
  { id: 'bn.eligibility', lang: 'bn', label: 'legal_question', reason: 'eligibility', allOf: [['যোগ্য', 'যোগ্যতা', 'পাব কি', 'পেতে পারি', 'সম্ভাবনা', 'জিতব', 'অনুমোদন হবে']] },
  // should I / can I
  { id: 'en.should_can', lang: 'en', label: 'legal_question', reason: 'should_can', allOf: [['should i', 'should we', 'should my', 'can i', 'could i', 'can we', 'can my', 'do i need to', 'is it ok', 'is it okay', 'is it safe', 'what should', 'what are my options', 'am i able', 'is it legal', 'what if i']] },
  { id: 'ne.should_can', lang: 'ne', label: 'legal_question', reason: 'should_can', allOf: [['गर्नुपर्छ', 'गर्ने कि', 'सक्छु', 'सक्छौं', 'मिल्छ', 'ठीक हुन्छ', 'के गर्ने']] },
  { id: 'bn.should_can', lang: 'bn', label: 'legal_question', reason: 'should_can', allOf: [['উচিত', 'পারব', 'পারি কি', 'করতে পারি', 'যেতে পারি', 'ঠিক হবে', 'কী করব']] },
  // travel
  { id: 'en.travel', lang: 'en', label: 'legal_question', reason: 'travel', allOf: [['travel*', 'trip', 'fly', 'flight', 'leave the country', 'leave the us', 'go back home', 'visit nepal', 'visit bangladesh', 'visit india', 'advance parole', 'go abroad', 'outside the us']] },
  { id: 'ne.travel', lang: 'ne', label: 'legal_question', reason: 'travel', allOf: [['यात्रा', 'विदेश जान', 'नेपाल जान', 'घर जान', 'फर्केर जान', 'देश बाहिर']] },
  { id: 'bn.travel', lang: 'bn', label: 'legal_question', reason: 'travel', allOf: [['ভ্রমণ', 'বিদেশে যেতে', 'দেশে যেতে', 'বাংলাদেশে যেতে', 'বাড়ি যেতে', 'দেশের বাইরে']] },
  // deportation
  { id: 'en.deport', lang: 'en', label: 'legal_question', reason: 'deportation', allOf: [['deport*']] },
  { id: 'ne.deport', lang: 'ne', label: 'legal_question', reason: 'deportation', allOf: [['डिपोर्ट', 'निष्कासन']] },
  { id: 'bn.deport', lang: 'bn', label: 'legal_question', reason: 'deportation', allOf: [['ডিপোর্ট', 'বহিষ্কার', 'অপসারণ']] },
  // strategy
  { id: 'en.strategy', lang: 'en', label: 'legal_question', reason: 'strategy', allOf: [['strategy', 'my options', 'waiver', 'appeal', 'what happens if', 'risk*', 'asylum', 'green card through', 'status change', 'change my status']] },
  { id: 'ne.strategy', lang: 'ne', label: 'legal_question', reason: 'strategy', allOf: [['विकल्प', 'छुट', 'पुनरावेदन', 'के हुन्छ भने', 'जोखिम', 'शरण']] },
  { id: 'bn.strategy', lang: 'bn', label: 'legal_question', reason: 'strategy', allOf: [['বিকল্প', 'মওকুফ', 'আপিল', 'কী হবে যদি', 'ঝুঁকি', 'আশ্রয়']] },
  // criminal (guardrail 4: facts only, attorney decides)
  { id: 'en.criminal', lang: 'en', label: 'legal_question', reason: 'criminal', allOf: [['arrest*', 'convict*', 'charged', 'criminal', 'police', 'dui', 'dwi', 'jail', 'prison', 'probation', 'felony', 'misdemeanor']] },
  { id: 'ne.criminal', lang: 'ne', label: 'legal_question', reason: 'criminal', allOf: [['पक्राउ', 'प्रहरी', 'पुलिस', 'जेल', 'अपराध', 'मुद्दा लाग', 'सजाय']] },
  { id: 'bn.criminal', lang: 'bn', label: 'legal_question', reason: 'criminal', allOf: [['গ্রেফতার', 'গ্রেপ্তার', 'পুলিশ', 'জেল', 'অপরাধ', 'সাজা', 'দোষী']] },
  // self filing
  { id: 'en.self_filing', lang: 'en', label: 'legal_question', reason: 'self_filing', allOf: [['file myself', 'file it myself', 'do it myself', 'without a lawyer', 'without an attorney', 'self file', 'self-file', 'fill the form myself', 'on my own']] },
  { id: 'en.self_filing_split', lang: 'en', label: 'legal_question', reason: 'self_filing', allOf: [['file', 'submit', 'apply', 'fill'], ['myself', 'on my own', 'by myself']] },
  { id: 'ne.self_filing', lang: 'ne', label: 'legal_question', reason: 'self_filing', allOf: [['आफैं फाइल', 'आफैँ फाइल', 'आफैं भर्', 'वकिल बिना', 'वकिलबिना']] },
  { id: 'bn.self_filing', lang: 'bn', label: 'legal_question', reason: 'self_filing', allOf: [['নিজেই ফাইল', 'নিজে ফাইল', 'নিজেই পূরণ', 'আইনজীবী ছাড়া', 'উকিল ছাড়া']] },
  // skipping a hearing or ignoring a notice (guardrail 3)
  { id: 'en.skip_hearing', lang: 'en', label: 'legal_question', reason: 'hearing_or_notice', allOf: [['skip', 'not go', "don't go", 'not attend', 'ignore', 'postpone', 'reschedule'], ['hearing', 'court', 'interview', 'letter', 'notice', 'appointment']] },
  { id: 'ne.skip_hearing', lang: 'ne', label: 'legal_question', reason: 'hearing_or_notice', allOf: [['नगए', 'नजाने', 'नजाऊँ', 'बेवास्ता', 'सार्न'], ['सुनुवाइ', 'पेशी', 'अदालत', 'अन्तर्वार्ता', 'पत्र']] },
  { id: 'bn.skip_hearing', lang: 'bn', label: 'legal_question', reason: 'hearing_or_notice', allOf: [['না গেলে', 'না যাই', 'উপেক্ষা', 'পিছিয়ে'], ['শুনানি', 'আদালত', 'সাক্ষাৎকার', 'ইন্টারভিউ', 'চিঠি']] },
  // fees and timelines: policy undecided (CLAUDE.md section 16, item 5), so route to the team
  { id: 'en.fees', lang: 'en', label: 'legal_question', reason: 'fees_timeline_policy_undecided', allOf: [['how much', 'cost', 'fee', 'fees', 'price', 'payment plan', 'how long', 'processing time', 'timeline', 'how many months', 'how many years', 'how soon']] },
  { id: 'ne.fees', lang: 'ne', label: 'legal_question', reason: 'fees_timeline_policy_undecided', allOf: [['शुल्क', 'कति पैसा', 'फी कति', 'फी लाग', 'कति लाग्छ', 'कति समय', 'कति दिन', 'कति महिना', 'कहिलेसम्म']] },
  { id: 'bn.fees', lang: 'bn', label: 'legal_question', reason: 'fees_timeline_policy_undecided', allOf: [['ফি কত', 'ফি লাগ', 'কত টাকা', 'খরচ', 'কতদিন', 'কত দিন', 'কত সময়', 'কত মাস']] },
];

export const GENERAL_INFO_PATTERNS: readonly KeywordPattern[] = [
  { id: 'en.general', lang: 'en', label: 'general_info', allOf: [['what is', "what's a", 'what does', 'what do you mean', 'explain', 'meaning of', 'stand for']] },
  { id: 'ne.general', lang: 'ne', label: 'general_info', allOf: [['भनेको के हो', 'के हो', 'अर्थ के', 'बुझाइदिनुहोस्']] },
  { id: 'bn.general', lang: 'bn', label: 'general_info', allOf: [['মানে কী', 'কী জিনিস', 'অর্থ কী', 'বুঝিয়ে বলুন']] },
];

export const OFF_TOPIC_PATTERNS: readonly KeywordPattern[] = [
  { id: 'en.off_topic', lang: 'en', label: 'off_topic', allOf: [['weather', 'joke', 'recipe', 'football', 'cricket', 'movie', 'song', 'lottery']] },
  { id: 'ne.off_topic', lang: 'ne', label: 'off_topic', allOf: [['मौसम', 'ठट्टा', 'चलचित्र', 'गीत', 'क्रिकेट']] },
  { id: 'bn.off_topic', lang: 'bn', label: 'off_topic', allOf: [['আবহাওয়া', 'কৌতুক', 'সিনেমা', 'গান', 'ক্রিকেট']] },
];
