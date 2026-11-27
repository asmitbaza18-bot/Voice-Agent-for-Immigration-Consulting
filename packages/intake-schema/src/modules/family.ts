import { L, type IntakeModule } from '../question.js';

export const family: IntakeModule = {
  id: 'family',
  title: L('Your family', 'तपाईंको परिवार', 'আপনার পরিবার'),
  questions: [
    {
      id: 'relationship_to_usc_or_lpr', module: 'family', type: 'enum', required: true, sensitive: false, allowDiscussWithAttorney: false,
      options: [
        { value: 'spouse', label: L('Spouse', 'श्रीमान् वा श्रीमती', 'স্বামী বা স্ত্রী') },
        { value: 'parent', label: L('Parent', 'आमा वा बुबा', 'মা বা বাবা') },
        { value: 'child', label: L('Son or daughter', 'छोरा वा छोरी', 'ছেলে বা মেয়ে') },
        { value: 'sibling', label: L('Brother or sister', 'दाजुभाइ वा दिदीबहिनी', 'ভাই বা বোন') },
        { value: 'fiance', label: L('Fiancé(e)', 'मंगेतर', 'বাগদত্তা') },
        { value: 'none', label: L('None of these', 'यीमध्ये कुनै होइन', 'এগুলোর কোনোটিই না') },
      ],
      prompt: L(
        'Which family member is a US citizen or green card holder? Are they your spouse, parent, child, or sibling?',
        'परिवारको कुन सदस्य अमेरिकी नागरिक वा ग्रिन कार्ड धारक हुनुहुन्छ? श्रीमान्/श्रीमती, आमाबुबा, छोराछोरी, वा दाजुभाइ-दिदीबहिनी?',
        'পরিবারের কোন সদস্য মার্কিন নাগরিক বা গ্রিন কার্ডধারী? স্বামী/স্ত্রী, মা-বাবা, সন্তান, নাকি ভাইবোন?',
      ),
    },
    {
      id: 'sponsor_status', module: 'family', type: 'enum', required: true, sensitive: false, allowDiscussWithAttorney: false,
      options: [
        { value: 'usc', label: L('US citizen', 'अमेरिकी नागरिक', 'মার্কিন নাগরিক') },
        { value: 'lpr', label: L('Green card holder', 'ग्रिन कार्ड धारक', 'গ্রিন কার্ডধারী') },
        { value: 'unsure', label: L('Not sure', 'थाहा छैन', 'নিশ্চিত নই') },
      ],
      prompt: L('Is that person a US citizen or a green card holder?', 'उहाँ अमेरिकी नागरिक हो कि ग्रिन कार्ड धारक?', 'তিনি কি মার্কিন নাগরিক নাকি গ্রিন কার্ডধারী?'),
    },
    {
      id: 'marriage_date', module: 'family', type: 'date', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('If you are married to them, what was your wedding date?', 'उहाँसँग विवाह भएको हो भने, विवाहको मिति कहिले हो?', 'তাঁর সাথে বিবাহিত হলে, বিয়ের তারিখ কবে?'),
    },
    {
      id: 'prior_marriages', module: 'family', type: 'boolean', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Was either of you married before?', 'के तपाईंहरूमध्ये कोही पहिले विवाहित हुनुहुन्थ्यो?', 'আপনাদের কেউ কি আগে বিবাহিত ছিলেন?'),
    },
    {
      id: 'sponsor_income_range', module: 'family', type: 'enum', required: false, sensitive: false, allowDiscussWithAttorney: true,
      options: [
        { value: 'under_25k', label: L('Under $25,000 a year', 'वार्षिक $२५,००० भन्दा कम', 'বছরে $২৫,০০০ এর কম') },
        { value: '25k_50k', label: L('$25,000 to $50,000', '$२५,००० देखि $५०,०००', '$২৫,০০০ থেকে $৫০,০০০') },
        { value: '50k_100k', label: L('$50,000 to $100,000', '$५०,००० देखि $१,००,०००', '$৫০,০০০ থেকে $১,০০,০০০') },
        { value: 'over_100k', label: L('Over $100,000', '$१,००,००० भन्दा बढी', '$১,০০,০০০ এর বেশি') },
        { value: 'unsure', label: L('Not sure', 'थाहा छैन', 'নিশ্চিত নই') },
      ],
      prompt: L('Roughly what is the sponsor’s yearly income?', 'प्रायोजकको वार्षिक आम्दानी लगभग कति हो?', 'স্পনসরের বার্ষিক আয় আনুমানিক কত?'),
    },
    {
      id: 'children_ages', module: 'family', type: 'number_list', required: false, sensitive: false, allowDiscussWithAttorney: false,
      prompt: L('Do you have children? How old is each of them?', 'के तपाईंका छोराछोरी छन्? प्रत्येकको उमेर कति हो?', 'আপনার কি সন্তান আছে? প্রত্যেকের বয়স কত?'),
    },
  ],
};
