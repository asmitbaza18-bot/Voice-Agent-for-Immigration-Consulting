import { L, type IntakeModule } from '../question.js';

export const removal: IntakeModule = {
  id: 'removal',
  title: L('Your court case', 'तपाईंको अदालती मुद्दा', 'আপনার আদালতের মামলা'),
  questions: [
    {
      id: 'hearing_date', module: 'removal', type: 'date', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('What is the date of your next court hearing?', 'तपाईंको अर्को अदालती सुनुवाइ कुन मितिमा छ?', 'আপনার পরবর্তী আদালতের শুনানি কবে?'),
    },
    {
      id: 'court_location', module: 'removal', type: 'text', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Which immigration court is it in?', 'यो कुन अध्यागमन अदालतमा हो?', 'এটি কোন অভিবাসন আদালতে?'),
    },
    {
      id: 'case_stage', module: 'removal', type: 'enum', required: true, sensitive: false, allowDiscussWithAttorney: false,
      options: [
        { value: 'master', label: L('First or short hearing (master calendar)', 'पहिलो वा छोटो सुनुवाइ (मास्टर क्यालेन्डर)', 'প্রথম বা সংক্ষিপ্ত শুনানি (মাস্টার ক্যালেন্ডার)') },
        { value: 'individual', label: L('Final hearing (individual)', 'अन्तिम सुनुवाइ (इन्डिभिजुअल)', 'চূড়ান্ত শুনানি (ইন্ডিভিজুয়াল)') },
        { value: 'appeal', label: L('Appeal', 'पुनरावेदन', 'আপিল') },
        { value: 'order', label: L('The judge already made an order', 'न्यायाधीशले आदेश दिइसक्नुभएको छ', 'বিচারক ইতিমধ্যে আদেশ দিয়েছেন') },
        { value: 'unsure', label: L('Not sure', 'थाहा छैन', 'নিশ্চিত নই') },
      ],
      prompt: L('What kind of hearing is it?', 'यो कस्तो सुनुवाइ हो?', 'এটি কী ধরনের শুনানি?'),
    },
    {
      id: 'years_in_us', module: 'removal', type: 'number', required: true, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('How many years have you lived in the US?', 'तपाईं अमेरिकामा कति वर्षदेखि बस्दै हुनुहुन्छ?', 'আপনি কত বছর ধরে যুক্তরাষ্ট্রে বাস করছেন?'),
    },
    {
      id: 'usc_lpr_relatives', module: 'removal', type: 'text_list', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L(
        'Do you have a spouse, parent or child who is a US citizen or green card holder? Who?',
        'के तपाईंको श्रीमान्/श्रीमती, आमाबुबा वा छोराछोरी अमेरिकी नागरिक वा ग्रिन कार्ड धारक हुनुहुन्छ? को?',
        'আপনার স্বামী/স্ত্রী, মা-বাবা বা সন্তান কি মার্কিন নাগরিক বা গ্রিন কার্ডধারী? কে?',
      ),
    },
    {
      id: 'ice_checkins', module: 'removal', type: 'boolean', required: false, sensitive: true, allowDiscussWithAttorney: false,
      prompt: L('Do you have to check in with ICE?', 'के तपाईंले ICE मा हाजिर हुनुपर्छ?', 'আপনাকে কি ICE-তে হাজিরা দিতে হয়?'),
    },
  ],
};
