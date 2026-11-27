import { L, type IntakeModule } from '../question.js';

export const core: IntakeModule = {
  id: 'core',
  title: L('About you', 'तपाईंको बारेमा', 'আপনার সম্পর্কে'),
  questions: [
    {
      id: 'full_name', module: 'core', type: 'text', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('What is your full name?', 'तपाईंको पूरा नाम के हो?', 'আপনার পুরো নাম কী?'),
    },
    {
      id: 'other_names', module: 'core', type: 'text_list', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L(
        'Have you used any other names, like a maiden name?',
        'के तपाईंले अरू कुनै नाम प्रयोग गर्नुभएको छ, जस्तै विवाहअघिको नाम?',
        'আপনি কি অন্য কোনো নাম ব্যবহার করেছেন, যেমন বিয়ের আগের নাম?',
      ),
    },
    {
      id: 'phone', module: 'core', type: 'text', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('What is the best phone number to reach you?', 'तपाईंलाई सम्पर्क गर्ने राम्रो फोन नम्बर कुन हो?', 'আপনার সাথে যোগাযোগের সবচেয়ে ভালো ফোন নম্বর কোনটি?'),
    },
    {
      id: 'email', module: 'core', type: 'text', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('What is your email address?', 'तपाईंको इमेल ठेगाना के हो?', 'আপনার ইমেইল ঠিকানা কী?'),
    },
    {
      id: 'sms_consent', module: 'core', type: 'boolean', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L(
        'May we send you text messages about your case?',
        'के हामी तपाईंलाई तपाईंको मुद्दाबारे SMS पठाउन सक्छौं?',
        'আমরা কি আপনার কেস সম্পর্কে আপনাকে টেক্সট মেসেজ পাঠাতে পারি?',
      ),
    },
    {
      id: 'case_for', module: 'core', type: 'enum', required: true, sensitive: false, allowDiscussWithAttorney: false,
      options: [
        { value: 'self', label: L('Myself', 'आफ्नै लागि', 'নিজের জন্য') },
        { value: 'relative', label: L('A relative', 'आफन्तको लागि', 'আত্মীয়ের জন্য') },
      ],
      followUps: [{ whenEquals: ['relative'], ask: ['relationship'] }],
      prompt: L('Are you calling for yourself or for a relative?', 'तपाईं आफ्नै लागि कि आफन्तको लागि फोन गर्दै हुनुहुन्छ?', 'আপনি কি নিজের জন্য নাকি কোনো আত্মীয়ের জন্য ফোন করছেন?'),
    },
    {
      id: 'relationship', module: 'core', type: 'text', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('How are you related to them?', 'उहाँसँग तपाईंको नाता के हो?', 'তাঁর সাথে আপনার সম্পর্ক কী?'),
    },
    {
      id: 'state', module: 'core', type: 'text', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Which US state do you live in?', 'तपाईं अमेरिकाको कुन राज्यमा बस्नुहुन्छ?', 'আপনি যুক্তরাষ্ট্রের কোন রাজ্যে থাকেন?'),
    },
    {
      id: 'city', module: 'core', type: 'text', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Which city?', 'कुन सहरमा?', 'কোন শহরে?'),
    },
    {
      id: 'goal_free_text', module: 'core', type: 'text', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('In your own words, what would you like help with?', 'आफ्नै शब्दमा भन्नुहोस्, तपाईंलाई केमा सहयोग चाहिएको छ?', 'নিজের ভাষায় বলুন, আপনি কোন বিষয়ে সাহায্য চান?'),
    },
    {
      id: 'country_of_birth', module: 'core', type: 'text', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Which country were you born in?', 'तपाईं कुन देशमा जन्मनुभएको हो?', 'আপনি কোন দেশে জন্মগ্রহণ করেছেন?'),
    },
    {
      id: 'citizenships', module: 'core', type: 'text_list', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Which countries are you a citizen of?', 'तपाईं कुन कुन देशको नागरिक हुनुहुन्छ?', 'আপনি কোন কোন দেশের নাগরিক?'),
    },
    {
      id: 'in_us', module: 'core', type: 'boolean', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Are you in the United States right now?', 'के तपाईं अहिले अमेरिकामा हुनुहुन्छ?', 'আপনি কি এখন যুক্তরাষ্ট্রে আছেন?'),
    },
    {
      id: 'other_parties', module: 'core', type: 'text_list', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L(
        'Please tell me the names of anyone else involved, like a spouse, sponsor or employer. We use this to check for conflicts.',
        'कृपया यसमा संलग्न अरू व्यक्तिहरूको नाम भन्नुहोस्, जस्तै श्रीमान्/श्रीमती, प्रायोजक वा रोजगारदाता। हामी यो स्वार्थको द्वन्द्व जाँच्न प्रयोग गर्छौं।',
        'এর সাথে জড়িত অন্য কারও নাম বলুন, যেমন স্বামী/স্ত্রী, স্পনসর বা নিয়োগকর্তা। আমরা এটি স্বার্থের দ্বন্দ্ব যাচাই করতে ব্যবহার করি।',
      ),
    },
    {
      id: 'lead_source', module: 'core', type: 'text', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('How did you hear about Chhetry Law?', 'तपाईंले Chhetry Law बारे कसरी थाहा पाउनुभयो?', 'আপনি Chhetry Law সম্পর্কে কীভাবে জানলেন?'),
    },
  ],
};
