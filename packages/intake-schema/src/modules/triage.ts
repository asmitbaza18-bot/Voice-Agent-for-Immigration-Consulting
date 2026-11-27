import { L, type IntakeModule } from '../question.js';

/**
 * Urgent triage (guardrail 5). Asked right after disclosures, before anything else.
 * Urgent flags are computed by the rules engine (`triage.urgent_flags`), not here.
 */
export const triage: IntakeModule = {
  id: 'triage',
  title: L('A few safety questions first', 'पहिले केही सुरक्षा प्रश्नहरू', 'প্রথমে কয়েকটি নিরাপত্তা প্রশ্ন'),
  questions: [
    {
      id: 'detained',
      module: 'triage',
      type: 'boolean',
      required: true,
      sensitive: false,
      allowDiscussWithAttorney: false,
      prompt: L(
        'Is the person this is about in immigration detention right now?',
        'यो कुरा जसको बारेमा हो, उहाँ अहिले अध्यागमन हिरासतमा हुनुहुन्छ?',
        'যার বিষয়ে কথা বলছেন, তিনি কি এখন অভিবাসন আটকে আছেন?',
      ),
    },
    {
      id: 'hearing_date',
      module: 'triage',
      type: 'date',
      required: false,
      sensitive: false,
      allowDiscussWithAttorney: false,
      prompt: L(
        'Do you have an immigration court hearing coming up? If yes, what is the date?',
        'के तपाईंको अध्यागमन अदालतमा सुनुवाइ आउँदैछ? छ भने, कुन मितिमा?',
        'আপনার কি অভিবাসন আদালতে শুনানি আছে? থাকলে, তারিখটি কবে?',
      ),
    },
    {
      id: 'has_nta_or_removal_order',
      module: 'triage',
      type: 'enum',
      required: true,
      sensitive: true,
      allowDiscussWithAttorney: false,
      options: [
        { value: 'none', label: L('Neither', 'कुनै पनि होइन', 'কোনোটিই না') },
        { value: 'nta', label: L('Notice to Appear', 'अदालतमा उपस्थित हुने सूचना (NTA)', 'হাজির হওয়ার নোটিশ (NTA)') },
        { value: 'removal_order', label: L('Removal or deportation order', 'निष्कासन वा डिपोर्ट आदेश', 'অপসারণ বা ডিপোর্টেশন আদেশ') },
        { value: 'unsure', label: L('Not sure', 'थाहा छैन', 'নিশ্চিত নই') },
      ],
      prompt: L(
        'Have you received a Notice to Appear, or a removal or deportation order?',
        'के तपाईंले अदालतमा उपस्थित हुने सूचना (NTA), वा निष्कासन वा डिपोर्ट आदेश पाउनुभएको छ?',
        'আপনি কি হাজির হওয়ার নোটিশ (NTA), অথবা অপসারণ বা ডিপোর্টেশন আদেশ পেয়েছেন?',
      ),
    },
    {
      id: 'ice_contact',
      module: 'triage',
      type: 'boolean',
      required: true,
      sensitive: true,
      allowDiscussWithAttorney: false,
      prompt: L(
        'Has ICE contacted you, come to your home or work, or asked you to report?',
        'के ICE ले तपाईंलाई सम्पर्क गरेको, घर वा कामको ठाउँमा आएको, वा हाजिर हुन भनेको छ?',
        'ICE কি আপনার সাথে যোগাযোগ করেছে, বাড়িতে বা কাজে এসেছে, বা হাজিরা দিতে বলেছে?',
      ),
    },
    {
      id: 'upcoming_deadline',
      module: 'triage',
      type: 'boolean',
      required: true,
      sensitive: false,
      allowDiscussWithAttorney: false,
      followUps: [{ whenEquals: [true], ask: ['upcoming_deadline_type', 'upcoming_deadline_date'] }],
      prompt: L(
        'Do you have any immigration deadline coming up, like a response to a letter?',
        'के तपाईंको कुनै अध्यागमन समयसीमा आउँदैछ, जस्तै कुनै पत्रको जवाफ दिनुपर्ने?',
        'আপনার কি কোনো অভিবাসন সময়সীমা সামনে আছে, যেমন কোনো চিঠির উত্তর দেওয়া?',
      ),
    },
    {
      id: 'upcoming_deadline_type',
      module: 'triage',
      type: 'text',
      required: false,
      sensitive: false,
      allowDiscussWithAttorney: false,
      prompt: L('What is the deadline for?', 'त्यो समयसीमा केको लागि हो?', 'সময়সীমাটি কীসের জন্য?'),
    },
    {
      id: 'upcoming_deadline_date',
      module: 'triage',
      type: 'date',
      required: false,
      sensitive: false,
      allowDiscussWithAttorney: false,
      prompt: L('What is the date of the deadline?', 'समयसीमाको मिति कहिले हो?', 'সময়সীমার তারিখ কবে?'),
    },
    {
      id: 'stuck_abroad',
      module: 'triage',
      type: 'boolean',
      required: true,
      sensitive: false,
      allowDiscussWithAttorney: false,
      prompt: L(
        'Is the person outside the US and unable to return?',
        'के उहाँ अमेरिका बाहिर हुनुहुन्छ र फर्कन सक्नुभएको छैन?',
        'তিনি কি যুক্তরাষ্ট্রের বাইরে আছেন এবং ফিরতে পারছেন না?',
      ),
    },
    {
      id: 'in_danger',
      module: 'triage',
      type: 'boolean',
      required: true,
      sensitive: true,
      allowDiscussWithAttorney: false,
      prompt: L(
        'Are you or anyone in your family in danger right now?',
        'के तपाईं वा तपाईंको परिवारको कोही अहिले खतरामा हुनुहुन्छ?',
        'আপনি বা আপনার পরিবারের কেউ কি এখন বিপদে আছেন?',
      ),
    },
  ],
};
