import { L, type IntakeModule } from '../question.js';

const UNSURE = { value: 'unsure', label: L('Not sure', 'थाहा छैन', 'নিশ্চিত নই') } as const;

/**
 * Immigration history. `overstay_length`, `departed_after_overstay` and
 * `reentry_without_inspection` are not in CLAUDE.md section 7's field list;
 * they were added as plain-language inputs for the unlawful-presence bar
 * rules (packages/rules). ATTORNEY TO REVIEW the wording and whether to keep them.
 */
export const history: IntakeModule = {
  id: 'history',
  title: L('Your immigration history', 'तपाईंको अध्यागमन इतिहास', 'আপনার অভিবাসন ইতিহাস'),
  questions: [
    {
      id: 'last_entry_manner', module: 'history', type: 'enum', required: true, sensitive: true, allowDiscussWithAttorney: true,
      options: [
        { value: 'visa', label: L('With a visa', 'भिसा लिएर', 'ভিসা নিয়ে') },
        { value: 'vwp', label: L('Visa Waiver Program (ESTA)', 'भिसा छुट कार्यक्रम (ESTA)', 'ভিসা ওয়েভার প্রোগ্রাম (ESTA)') },
        { value: 'parole', label: L('Parole', 'प्यारोल', 'প্যারোল') },
        { value: 'ewi', label: L('Without being inspected at the border', 'सीमामा जाँच नगराई', 'সীমান্তে পরিদর্শন ছাড়া') },
        UNSURE,
      ],
      prompt: L(
        'The last time you came into the US, how did you enter?',
        'पछिल्लो पटक तपाईं अमेरिका आउँदा, कसरी प्रवेश गर्नुभयो?',
        'শেষবার আপনি যুক্তরাষ্ট্রে আসার সময় কীভাবে প্রবেশ করেছিলেন?',
      ),
    },
    {
      id: 'last_entry_date', module: 'history', type: 'date', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('What date was that last entry?', 'त्यो पछिल्लो प्रवेश कुन मितिमा भएको थियो?', 'শেষ প্রবেশের তারিখ কবে ছিল?'),
    },
    {
      id: 'i94', module: 'history', type: 'text', required: false, sensitive: true, allowDiscussWithAttorney: false,
      prompt: L('Do you have your I-94 number? You can skip this.', 'के तपाईंसँग I-94 नम्बर छ? यो छोड्न पनि सक्नुहुन्छ।', 'আপনার কাছে কি I-94 নম্বর আছে? চাইলে এটি বাদ দিতে পারেন।'),
    },
    {
      id: 'current_status', module: 'history', type: 'text', required: true, sensitive: true, allowDiscussWithAttorney: true,
      prompt: L(
        'What is your current immigration status, if you know it?',
        'तपाईंलाई थाहा छ भने, अहिले तपाईंको अध्यागमन स्थिति के हो?',
        'আপনি জানলে, এখন আপনার অভিবাসন স্ট্যাটাস কী?',
      ),
    },
    {
      id: 'status_expiry', module: 'history', type: 'date', required: false, sensitive: true, allowDiscussWithAttorney: true,
      prompt: L('When does that status end?', 'त्यो स्थिति कहिले सकिन्छ?', 'সেই স্ট্যাটাস কবে শেষ হয়?'),
    },
    {
      id: 'overstay_length', module: 'history', type: 'enum', required: false, sensitive: true, allowDiscussWithAttorney: true,
      options: [
        { value: 'none', label: L('Never stayed past my permitted time', 'अनुमति भएको समयभन्दा बढी कहिल्यै बसिनँ', 'অনুমোদিত সময়ের বেশি কখনো থাকিনি') },
        { value: 'under_180_days', label: L('Less than 6 months', '६ महिनाभन्दा कम', '৬ মাসের কম') },
        { value: '180_days_to_1_year', label: L('Between 6 months and 1 year', '६ महिनादेखि १ वर्षसम्म', '৬ মাস থেকে ১ বছর') },
        { value: 'over_1_year', label: L('1 year or more', '१ वर्ष वा बढी', '১ বছর বা তার বেশি') },
        UNSURE,
      ],
      prompt: L(
        'Have you ever stayed in the US longer than you were allowed? If so, about how long?',
        'के तपाईं कहिल्यै अमेरिकामा अनुमति भएको समयभन्दा बढी बस्नुभएको छ? भए, लगभग कति समय?',
        'আপনি কি কখনো অনুমোদিত সময়ের চেয়ে বেশি যুক্তরাষ্ট্রে থেকেছেন? থাকলে, প্রায় কতদিন?',
      ),
    },
    {
      id: 'departed_after_overstay', module: 'history', type: 'boolean', required: false, sensitive: true, allowDiscussWithAttorney: true,
      prompt: L(
        'After that time, did you leave the US?',
        'त्यसपछि, के तपाईं अमेरिकाबाट बाहिर जानुभयो?',
        'তারপর, আপনি কি যুক্তরাষ্ট্র ছেড়ে গিয়েছিলেন?',
      ),
    },
    {
      id: 'reentry_without_inspection', module: 'history', type: 'boolean', required: false, sensitive: true, allowDiscussWithAttorney: true,
      prompt: L(
        'Did you come back, or try to come back, without being inspected at the border?',
        'के तपाईं सीमामा जाँच नगराई फर्कनुभयो, वा फर्कने प्रयास गर्नुभयो?',
        'আপনি কি সীমান্তে পরিদর্শন ছাড়া ফিরে এসেছিলেন, বা আসার চেষ্টা করেছিলেন?',
      ),
    },
    {
      id: 'entries_departures', module: 'history', type: 'text_list', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L(
        'Please list your other trips into and out of the US, with rough dates.',
        'कृपया अमेरिका आउने-जाने अरू यात्राहरू, अन्दाजी मितिसहित भन्नुहोस्।',
        'যুক্তরাষ্ট্রে আসা-যাওয়ার অন্যান্য ভ্রমণ, আনুমানিক তারিখসহ বলুন।',
      ),
    },
    {
      id: 'prior_applications', module: 'history', type: 'text_list', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L(
        'Have you filed any immigration applications before? Tell me the form and receipt number if you have it.',
        'के तपाईंले पहिले कुनै अध्यागमन निवेदन दिनुभएको छ? फारम र रसिद नम्बर छ भने भन्नुहोस्।',
        'আপনি কি আগে কোনো অভিবাসন আবেদন করেছেন? ফর্ম ও রসিদ নম্বর থাকলে বলুন।',
      ),
    },
    {
      id: 'denials', module: 'history', type: 'boolean', required: false, sensitive: true, allowDiscussWithAttorney: true,
      prompt: L(
        'Has any visa or immigration application ever been denied?',
        'के कहिल्यै कुनै भिसा वा अध्यागमन निवेदन अस्वीकृत भएको छ?',
        'কোনো ভিসা বা অভিবাসন আবেদন কি কখনো প্রত্যাখ্যাত হয়েছে?',
      ),
    },
    {
      id: 'prior_court_or_removal', module: 'history', type: 'enum', required: true, sensitive: true, allowDiscussWithAttorney: true,
      options: [
        { value: 'none', label: L('No', 'छैन', 'না') },
        { value: 'court_case', label: L('Yes, a court case', 'छ, अदालतमा मुद्दा', 'হ্যাঁ, আদালতে মামলা') },
        { value: 'removal_order', label: L('Yes, a removal order', 'छ, निष्कासन आदेश', 'হ্যাঁ, অপসারণ আদেশ') },
        { value: 'deported', label: L('Yes, I was deported or removed', 'छ, मलाई डिपोर्ट गरिएको थियो', 'হ্যাঁ, আমাকে ডিপোর্ট করা হয়েছিল') },
        UNSURE,
      ],
      prompt: L(
        'Have you ever been in immigration court, or had a removal order?',
        'के तपाईं कहिल्यै अध्यागमन अदालतमा पर्नुभएको छ, वा निष्कासन आदेश पाउनुभएको छ?',
        'আপনি কি কখনো অভিবাসন আদালতে গিয়েছেন, বা অপসারণ আদেশ পেয়েছেন?',
      ),
    },
    {
      id: 'a_number', module: 'history', type: 'text', required: false, sensitive: true, encrypted: true, allowDiscussWithAttorney: false,
      prompt: L(
        'If you have an A-number, what is it? It starts with the letter A.',
        'तपाईंसँग A-नम्बर छ भने, त्यो के हो? यो A अक्षरबाट सुरु हुन्छ।',
        'আপনার A-নম্বর থাকলে সেটি কী? এটি A অক্ষর দিয়ে শুরু হয়।',
      ),
    },
    {
      id: 'prior_attorney', module: 'history', type: 'boolean', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Have you worked with another immigration attorney before?', 'के तपाईंले पहिले अर्को अध्यागमन वकिलसँग काम गर्नुभएको छ?', 'আপনি কি আগে অন্য কোনো অভিবাসন আইনজীবীর সাথে কাজ করেছেন?'),
    },
  ],
};
