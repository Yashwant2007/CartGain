/**
 * Client-safe localization + currency helpers for the bargain surfaces.
 * Pure data — safe to import from both server routes and client widgets
 * (no openai/prisma imports in here).
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'AED ', AUD: 'A$',
  CAD: 'C$', SGD: 'S$', JPY: '¥', PKR: 'Rs ', BDT: '৳',
}

export function currencySymbolFor(currency: string | undefined | null): string {
  if (!currency) return '₹'
  const sym = CURRENCY_SYMBOLS[currency.toUpperCase()]
  return sym ?? `${currency} `
}

/**
 * The languages we actually localize chrome/terminal microcopy into.
 * Hinglish = Latin-script Hindi. Missing from this table (kn/ml/or) falls
 * back to English; the AI conversation itself still auto-mirrors every
 * language via the engine's language guidance.
 */
export const I18N_LANGS = ['en', 'hinglish', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'pa'] as const
export type UiLang = (typeof I18N_LANGS)[number]

export type UiKey =
  | 'farewell_friendly'
  | 'farewell_strict'
  | 'farewell_playful'
  | 'attempts_exhausted'
  | 'terminal_accepted'
  | 'terminal_rejected'
  | 'terminal_expired'
  | 'terminal_abandoned'
  | 'opt_out'
  | 'negotiate'
  | 'dealTitle'
  | 'skip'
  | 'aiPowered'
  | 'attemptsLeft'
  | 'connecting'
  | 'assistant'
  | 'notice'
  | 'offered'
  | 'typeOffer'
  | 'sessionEnded'
  | 'acceptDeal'
  | 'dealComplete'
  | 'youSaved'
  | 'newPrice'
  | 'copy'
  | 'codeApply'
  | 'optOutMsg'

const I18N: Record<UiLang, Record<UiKey, string>> = {
  en: {
    farewell_friendly: "I understand, friend. The door's always open if you change your mind. Take care! 👋",
    farewell_strict: 'Understood. This negotiation is closed. You may start a new session anytime.',
    farewell_playful: 'Aw, really? 😅 Well, if you change your mind, you know where I am! No hard feelings 🙌',
    attempts_exhausted: "Sorry, you've used all your attempts for this item. Maybe next time! 🙂",
    terminal_accepted: "This deal is already done! 🎉 Your discount code is ready. Start a new session if you're interested in another product.",
    terminal_rejected: "This negotiation has ended. Start a new session for a different product if you'd like to bargain again.",
    terminal_expired: "This session expired. Please start a new one if you're still interested.",
    terminal_abandoned: 'This session was abandoned. Please start a new one.',
    opt_out: 'You opted out of AI pricing. Buy at the regular price instead.',
    negotiate: 'Negotiate Price',
    dealTitle: "Let's make a deal",
    skip: 'Skip — buy at full price →',
    aiPowered: 'AI-powered negotiation',
    attemptsLeft: '{n} left',
    connecting: 'Connecting...',
    assistant: 'Assistant',
    notice: 'Notice',
    offered: 'Offered:',
    typeOffer: 'Type your offer...',
    sessionEnded: 'Session ended',
    acceptDeal: 'Accept & Get Code',
    dealComplete: '✓ Deal Complete',
    youSaved: 'You saved {x}!',
    newPrice: 'New price:',
    copy: 'Copy',
    codeApply: 'Code will apply automatically at checkout.',
    optOutMsg: 'No problem — you can buy at the regular price below. You opted out of AI pricing.',
  },
  hinglish: {
    farewell_friendly: 'Theek hai dost, door hamesha khula hai. Agar mann badle toh bata dena. Dhyaan rakhna! 👋',
    farewell_strict: 'Samajh gaya. Yeh baat-cheet yahin khatam hoti hai. Aap kabhi bhi naya session shuru kar sakte ho.',
    farewell_playful: 'Arre seriously? 😅 Koi baat nahi, koi hard feelings nahi! Jab mann kare aa jao 🙌',
    attempts_exhausted: 'Sorry, is product ke liye aapke saare attempts khatam ho gaye. Agli baar zaroor! 🙂',
    terminal_accepted: 'Yeh deal ho chuki hai! 🎉 Aapka discount code ready hai. Naya product lena ho toh naya session shuru kijiye.',
    terminal_rejected: 'Yeh negotiation khatam ho gaya. Kisi aur product ke liye naya session shuru kar sakte hain.',
    terminal_expired: 'Yeh session expire ho gaya. Agar ab bhi interested ho toh naya shuru karo.',
    terminal_abandoned: 'Yeh session band ho gaya. Naya shuru karein.',
    opt_out: 'Aapne AI pricing se opt-out kar diya. Regular price par buy kar sakte hain.',
    negotiate: 'Bhaw Bolo',
    dealTitle: 'Chalo deal karte hain',
    skip: 'Skip karo — full price par kharido →',
    aiPowered: 'AI-powered negotiation',
    attemptsLeft: '{n} baaki',
    connecting: 'Connect ho raha hai...',
    assistant: 'Assistant',
    notice: 'Notice',
    offered: 'Offer:',
    typeOffer: 'Apni bhaw likho...',
    sessionEnded: 'Session khatam',
    acceptDeal: 'Deal Accept karo & Code Lo',
    dealComplete: '✓ Deal Complete',
    youSaved: 'Aapne bachaye {x}!',
    newPrice: 'Nayi qeemat:',
    copy: 'Copy',
    codeApply: 'Code checkout par automatically lag jayega.',
    optOutMsg: 'Koi baat nahi — aap regular price par buy kar sakte ho. Aapne AI pricing se opt-out kiya.',
  },
  hi: {
    farewell_friendly: 'समझ गया दोस्त, दरवाज़ा हमेशा खुला है। अगर मन बदले तो बता देना। ध्यान रखना! 👋',
    farewell_strict: 'समझ गया। यह सौदेबाज़ी समाप्त होती है। आप कभी भी नया सेशन शुरू कर सकते हैं।',
    farewell_playful: 'अरे सच में? 😅 कोई बात नहीं, कोई गिला नहीं! जब मन हो आ जाइए 🙌',
    attempts_exhausted: 'क्षमा करें, इस वस्तु के लिए आपके सारे प्रयास समाप्त हो गए। अगली बार ज़रूर! 🙂',
    terminal_accepted: 'यह सौदा हो चुका है! 🎉 आपका डिस्काउंट कोड तैयार है। दूसरा उत्पाद लेना हो तो नया सेशन शुरू करें।',
    terminal_rejected: 'यह सौदेबाज़ी समाप्त हो गई है। दूसरे उत्पाद के लिए नया सेशन शुरू करें।',
    terminal_expired: 'यह सेशन समाप्त हो गया। यदि फिर भी रुचि है तो नया शुरू करें।',
    terminal_abandoned: 'यह सेशन बंद हो गया। कृपया नया शुरू करें।',
    opt_out: 'आपने AI मूल्य-निर्धारण से ऑप्ट-आउट कर लिया। नियमित कीमत पर खरीद सकते हैं।',
    negotiate: 'भाव मोल करें',
    dealTitle: 'चलिए सौदा करते हैं',
    skip: 'छोड़ें — पूरी कीमत पर खरीदें →',
    aiPowered: 'AI-संचालित सौदेबाज़ी',
    attemptsLeft: '{n} बाकी',
    connecting: 'कनेक्ट हो रहा है...',
    assistant: 'सहायक',
    notice: 'सूचना',
    offered: 'ऑफ़र:',
    typeOffer: 'अपना भाव लिखें...',
    sessionEnded: 'सेशन समाप्त',
    acceptDeal: 'सौदा स्वीकारें और कोड पाएँ',
    dealComplete: '✓ सौदा पूर्ण',
    youSaved: 'आपने बचाए {x}!',
    newPrice: 'नई कीमत:',
    copy: 'कॉपी',
    codeApply: 'कोड चेकआउट पर स्वतः लागू होगा।',
    optOutMsg: 'कोई बात नहीं — आप नियमित कीमत पर खरीद सकते हैं। आपने AI मूल्य-निर्धारण से ऑप्ट-आउट किया।',
  },
  ta: {
    farewell_friendly: 'புரிந்தது நண்பரே, கதவு எப்போதும் திறந்தே உள்ளது. மனம் மாறினால் சொல்லுங்கள். பார்த்துக்கொள்ளுங்கள்! 👋',
    farewell_strict: 'புரிந்தது. இந்தப் பேச்சுவார்த்தை முடிந்தது. எப்போது வேண்டுமானாலும் புதிய அமர்வைத் தொடங்கலாம்.',
    farewell_playful: 'ஓ, உண்மையா? 😅 பரவாயில்லை, எந்த மனக்கசப்பும் இல்லை! மனம் வந்தால் வாருங்கள் 🙌',
    attempts_exhausted: 'மன்னிக்கவும், இந்தப் பொருளுக்கான அனைத்து முயற்சிகளும் முடிந்துவிட்டன. அடுத்த முறை நிச்சயம்! 🙂',
    terminal_accepted: 'இந்த ஒப்பந்தம் முடிந்துவிட்டது! 🎉 உங்கள் தள்ளுபடி குறியீடு தயாராக உள்ளது. வேறு தயாரிப்பு வேண்டுமானால் புதிய அமர்வைத் தொடங்குங்கள்.',
    terminal_rejected: 'இந்தப் பேச்சுவார்த்தை முடிந்தது. வேறு தயாரிப்புக்கு புதிய அமர்வைத் தொடங்கலாம்.',
    terminal_expired: 'இந்த அமர்வு காலாவதியானது. ஆர்வம் இருந்தால் புதியதாகத் தொடங்குங்கள்.',
    terminal_abandoned: 'இந்த அமர்வு கைவிடப்பட்டது. புதியதாகத் தொடங்குங்கள்.',
    opt_out: 'AI விலையிலிருந்து விலகிவிட்டீர்கள். நீங்கள் நியம விலையில் வாங்கலாம்.',
    negotiate: 'விலை பேசுங்கள்',
    dealTitle: 'ஒப்பந்தம் செய்வோம்',
    skip: 'தவிர்க்கவும் — முழு விலையில் வாங்குங்கள் →',
    aiPowered: 'AI அடிப்படையிலான பேச்சுவார்த்தை',
    attemptsLeft: '{n} மீதம்',
    connecting: 'இணைக்கிறது...',
    assistant: 'உதவியாளர்',
    notice: 'அறிவிப்பு',
    offered: 'ஆஃபர்:',
    typeOffer: 'உங்கள் விலையை எழுதுங்கள்...',
    sessionEnded: 'அமர்வு முடிந்தது',
    acceptDeal: 'ஒப்பந்தத்தை ஏற்று குறியீடு பெறுக',
    dealComplete: '✓ ஒப்பந்தம் முடிந்தது',
    youSaved: 'நீங்கள் சேமித்தது {x}!',
    newPrice: 'புதிய விலை:',
    copy: 'நகலெடு',
    codeApply: 'குறியீடு சரிபார்ப்பில் தானாகப் பயன்படும்.',
    optOutMsg: 'பரவாயில்லை — நீங்கள் நியம விலையில் வாங்கலாம். AI விலையிலிருந்து விலகியுள்ளீர்கள்.',
  },
  te: {
    farewell_friendly: 'అర్థమైంది స్నేహితుడా, తలుపు ఎప్పుడూ తెరిచే ఉంది. మనసు మారితే చెప్పండి. జాగ్రత్త! 👋',
    farewell_strict: 'అర్థమైంది. ఈ చర్చ ముగింపుకు వచ్చింది. ఎప్పుడైనా కొత్త సెషన్ ప్రారంభించవచ్చు.',
    farewell_playful: 'ఓహ్, నిజంగా? 😅 ఫర్వాలేదు, ఎలాంటి కసరత్తు లేదు! మనసొచ్చినప్పుడు రండి 🙌',
    attempts_exhausted: 'క్షమించండి, ఈ ఉత్పత్తికి మీ ప్రయత్నాలు అయిపోయాయి. తర్వాత సారి తప్పకుండా! 🙂',
    terminal_accepted: 'ఈ ఒప్పందం పూర్తయింది! 🎉 మీ డిస్కౌంట్ కోడ్ సిద్ధంగా ఉంది. వేరే ఉత్పత్తి కావాలంటే కొత్త సెషన్ ప్రారంభించండి.',
    terminal_rejected: 'ఈ చర్చ ముగిసింది. వేరే ఉత్పత్తి కోసం కొత్త సెషన్ ప్రారంభించవచ్చు.',
    terminal_expired: 'ఈ సెషన్ గడువు ముగిసింది. ఆసక్తి ఉంటే కొత్తది ప్రారంభించండి.',
    terminal_abandoned: 'ఈ సెషన్ విడిచిపెట్టబడింది. దయచేసి కొత్తది ప్రారంభించండి.',
    opt_out: 'మీరు AI ధర నుండి తప్పుకున్నారు. మీరు నిర్ణీత ధరకు కొనవచ్చు.',
    negotiate: 'ధర చర్చించండి',
    dealTitle: 'ఒప్పందం చేద్దాం',
    skip: 'వదిలేయండి — పూర్తి ధరకు కొనండి →',
    aiPowered: 'AI ఆధారిత చర్చ',
    attemptsLeft: '{n} మిగిలి ఉన్నాయి',
    connecting: 'కనెక్ట్ అవుతోంది...',
    assistant: 'సహాయకుడు',
    notice: 'గమనిక',
    offered: 'ఆఫర్:',
    typeOffer: 'మీ ధరను టైప్ చేయండి...',
    sessionEnded: 'సెషన్ ముగిసింది',
    acceptDeal: 'ఒప్పందం ఆమోదించి కోడ్ పొందండి',
    dealComplete: '✓ ఒప్పందం పూర్తయింది',
    youSaved: 'మీరు ఆదా చేసినది {x}!',
    newPrice: 'కొత్త ధర:',
    copy: 'కాపీ',
    codeApply: 'కోడ్ చెకౌట్ వద్ద స్వయంచాలకంగా వర్తిస్తుంది.',
    optOutMsg: 'ఫర్వాలేదు — మీరు నిర్ణీత ధరకు కొనవచ్చు. మీరు AI ధర నుండి తప్పుకున్నారు.',
  },
  bn: {
    farewell_friendly: 'বুঝেছি বন্ধু, দরজা সবসময় খোলা। মন বদলালে জানিয়ে দিও। ভালো থেকো! 👋',
    farewell_strict: 'বুঝেছি। এই আলোচনা এখানেই শেষ। যে কোনো সময় নতুন সেশন শুরু করতে পারেন।',
    farewell_playful: 'ওহ, সত্যিই? 😅 কোনো সমস্যা নেই, কোনো অভিমান নেই! মন চাইলে আসবেন 🙌',
    attempts_exhausted: 'দুঃখিত, এই পণ্যের জন্য আপনার সব চেষ্টা শেষ হয়ে গেছে। পরের বার নিশ্চয়ই! 🙂',
    terminal_accepted: 'এই দরদাম শেষ! 🎉 আপনার ডিসকাউন্ট কোড রেডি। অন্য পণ্য চাইলে নতুন সেশন শুরু করুন।',
    terminal_rejected: 'এই দরদাম শেষ হয়েছে। অন্য পণ্যের জন্য নতুন সেশন শুরু করতে পারেন।',
    terminal_expired: 'এই সেশনের মেয়াদ শেষ। আগ্রহ থাকলে নতুন শুরু করুন।',
    terminal_abandoned: 'এই সেশন বাতিল হয়েছে। অনুগ্রহ করে নতুন শুরু করুন।',
    opt_out: 'আপনি AI মূল্যধারণ থেকে অপ্ট-আউট করেছেন। আপনি নিয়মিত দামে কিনতে পারেন।',
    negotiate: 'দরদাম করুন',
    dealTitle: 'চলো দর করে ফেলি',
    skip: 'বাদ দিন — পূর্ণ দামে কিনুন →',
    aiPowered: 'AI চালিত দরদাম',
    attemptsLeft: '{n} বাকি',
    connecting: 'সংযোগ হচ্ছে...',
    assistant: 'সহায়ক',
    notice: 'বিজ্ঞপ্তি',
    offered: 'অফার:',
    typeOffer: 'আপনার দাম লিখুন...',
    sessionEnded: 'সেশন শেষ',
    acceptDeal: 'দর মেনে কোড নিন',
    dealComplete: '✓ দর চূড়ান্ত',
    youSaved: 'আপনি বাঁচালেন {x}!',
    newPrice: 'নতুন দাম:',
    copy: 'কপি',
    codeApply: 'চেকআউটে কোড স্বয়ংক্রিয়ভাবে প্রয়োগ হবে।',
    optOutMsg: 'সমস্যা নেই — আপনি নিয়মিত দামে কিনতে পারেন। আপনি AI মূল্যধারণ থেকে অপ্ট-আউট করেছেন।',
  },
  mr: {
    farewell_friendly: 'समजलो मित्रा, दार नेहमी उघडे आहे. मन बदललं तर सांग. काळजी घ्या! 👋',
    farewell_strict: 'समजलो. ही सौदेबाजी संपली. कधीही नवीन सत्र सुरू करू शकता.',
    farewell_playful: 'अरे, खरंच? 😅 काही हरकत नाही, मनात काही नाही! मन आलं तर या 🙌',
    attempts_exhausted: 'क्षमस्व, या वस्तूसाठी तुमचे सर्व प्रयत्न संपले. पुढच्या वेळी नक्की! 🙂',
    terminal_accepted: 'हा सौदा झाला! 🎉 तुमचा सूट कोड तयार आहे. दुसरी वस्तू हवी असल्यास नवीन सत्र सुरू करा.',
    terminal_rejected: 'ही सौदेबाजी संपली. दुसऱ्या वस्तूसाठी नवीन सत्र सुरू करा.',
    terminal_expired: 'हे सत्र संपले. स्वारस्य असेल तर नवीन सुरू करा.',
    terminal_abandoned: 'हे सत्र रद्द झाले. कृपया नवीन सुरू करा.',
    opt_out: 'तुम्ही AI किंमतीतून बाहेर पडलात. तुम्ही नियमित किमतीत खरेदी करू शकता.',
    negotiate: 'भाव मोल करा',
    dealTitle: 'चला सौदा करूया',
    skip: 'वगळा — पूर्ण किमतीत खरेदी करा →',
    aiPowered: 'AI-आधारित सौदेबाजी',
    attemptsLeft: '{n} शिल्लक',
    connecting: 'कनेक्ट होत आहे...',
    assistant: 'सहाय्यक',
    notice: 'सूचना',
    offered: 'ऑफर:',
    typeOffer: 'तुमचा भाव लिहा...',
    sessionEnded: 'सत्र संपले',
    acceptDeal: 'सौदा स्वीकारा आणि कोड मिळवा',
    dealComplete: '✓ सौदा पूर्ण',
    youSaved: 'तुम्ही वाचवले {x}!',
    newPrice: 'नवीन किंमत:',
    copy: 'कॉपी',
    codeApply: 'कोड चेकआउटवर आपोआप लागू होईल.',
    optOutMsg: 'हरकत नाही — तुम्ही नियमित किमतीत खरेदी करू शकता. तुम्ही AI किंमतीतून बाहेर पडलात.',
  },
  gu: {
    farewell_friendly: 'સમજ્યો મિત્ર, દરવાજો હંમેશા ખુલ્લો છે. મન બદલાય તો કહેજે. કાળજી રાખજો! 👋',
    farewell_strict: 'સમજ્યો. આ સોદાબાજી અહીં સમાપ્ત. કોઈ પણ સમયે નવું સત્ર શરૂ કરી શકો છો.',
    farewell_playful: 'ઓહ, ખરેખર? 😅 કોઈ સમસ્યા નથી, કોઈ ફરિયાદ નથી! મન થાય તો આવજો 🙌',
    attempts_exhausted: 'માફ કરશો, આ વસ્તુ માટે તમારા બધા પ્રયત્નો પૂરા થયા. આગલી વખતે ચોક્કસ! 🙂',
    terminal_accepted: 'આ સોદો થઈ ગયો! 🎉 તમારો ડિસ્કાઉન્ટ કોડ તૈયાર છે. બીજું ઉત્પાદન જોઈએ તો નવું સત્ર શરૂ કરો.',
    terminal_rejected: 'આ સોદાબાજી પૂરી થઈ. બીજા ઉત્પાદન માટે નવું સત્ર શરૂ કરી શકો છો.',
    terminal_expired: 'આ સત્ર સમાપ્ત થયું. રસ હોય તો નવું શરૂ કરો.',
    terminal_abandoned: 'આ સત્ર છોડી દેવામાં આવ્યું. કૃપા કરીને નવું શરૂ કરો.',
    opt_out: 'તમે AI કિંમત-નિર્ધારણમાંથી બહાર નીકળ્યા છો. તમે નિયમિત કિંમતે ખરીદી શકો છો.',
    negotiate: 'ભાવ મોલ કરો',
    dealTitle: 'ચાલો સોદો કરીએ',
    skip: 'છોડો — સંપૂર્ણ કિંમતે ખરીદો →',
    aiPowered: 'AI-સંચાલિત સોદાબાજી',
    attemptsLeft: '{n} બાકી',
    connecting: 'કનેક્ટ થાય છે...',
    assistant: 'સહાયક',
    notice: 'સૂચના',
    offered: 'ઓફર:',
    typeOffer: 'તમારો ભાવ લખો...',
    sessionEnded: 'સત્ર સમાપ્ત',
    acceptDeal: 'સોદો સ્વીકારો અને કોડ મેળવો',
    dealComplete: '✓ સોદો પૂર્ણ',
    youSaved: 'તમે બચાવ્યા {x}!',
    newPrice: 'નવી કિંમત:',
    copy: 'કૉપિ',
    codeApply: 'કોડ ચેકઆઉટ પર આપમેળે લાગુ થશે.',
    optOutMsg: 'કોઈ સમસ્યા નહીં — તમે નિયમિત કિંમતે ખરીદી શકો છો. તમે AI કિંમત-નિર્ધારણમાંથી બહાર નીકળ્યા છો.',
  },
  pa: {
    farewell_friendly: 'ਸਮਝ ਗਿਆ ਮਿੱਤਰਾ, ਦਰਵਾਜ਼ਾ ਹਮੇਸ਼ਾ ਖੁੱਲ੍ਹਾ ਹੈ। ਮਨ ਬਦਲੇ ਤਾਂ ਦੱਸ ਦੇਣਾ। ਖ਼ਿਆਲ ਰੱਖੀਂ! 👋',
    farewell_strict: 'ਸਮਝ ਗਿਆ। ਇਹ ਸੌਦੇਬਾਜ਼ੀ ਇੱਥੇ ਖ਼ਤਮ। ਤੁਸੀਂ ਕਦੇ ਵੀ ਨਵਾਂ ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰ ਸਕਦੇ ਹੋ।',
    farewell_playful: 'ਓ, ਸੱਚਮੁੱਚ? 😅 ਕੋਈ ਗੱਲ ਨਹੀਂ, ਕੋਈ ਗਿਲਾ ਨਹੀਂ! ਮਨ ਕੀਤਾ ਤਾਂ ਆ ਜਾਣਾ 🙌',
    attempts_exhausted: 'ਮਾਫ਼ ਕਰਨਾ, ਇਸ ਚੀਜ਼ ਲਈ ਤੁਹਾਡੇ ਸਾਰੇ ਯਤਨ ਖ਼ਤਮ ਹੋ ਗਏ। ਅਗਲੀ ਵਾਰ ਜ਼ਰੂਰ! 🙂',
    terminal_accepted: 'ਇਹ ਸੌਦਾ ਹੋ ਗਿਆ! 🎉 ਤੁਹਾਡਾ ਡਿਸਕਾਊਂਟ ਕੋਡ ਤਿਆਰ ਹੈ। ਕੋਈ ਹੋਰ ਉਤਪਾਦ ਚਾਹੀਦਾ ਹੈ ਤਾਂ ਨਵਾਂ ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰੋ।',
    terminal_rejected: 'ਇਹ ਸੌਦੇਬਾਜ਼ੀ ਖ਼ਤਮ ਹੋ ਗਈ। ਕਿਸੇ ਹੋਰ ਉਤਪਾਦ ਲਈ ਨਵਾਂ ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰ ਸਕਦੇ ਹੋ।',
    terminal_expired: 'ਇਹ ਸੈਸ਼ਨ ਖ਼ਤਮ ਹੋ ਗਿਆ। ਦਿਲਚਸਪੀ ਹੋਵੇ ਤਾਂ ਨਵਾਂ ਸ਼ੁਰੂ ਕਰੋ।',
    terminal_abandoned: 'ਇਹ ਸੈਸ਼ਨ ਬੰਦ ਕਰ ਦਿੱਤਾ ਗਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਨਵਾਂ ਸ਼ੁਰੂ ਕਰੋ।',
    opt_out: 'ਤੁਸੀਂ AI ਕੀਮਤ-ਨਿਰਧਾਰਨ ਤੋਂ ਬਾਹਰ ਹੋ ਗਏ। ਤੁਸੀਂ ਰੈਗੂਲਰ ਕੀਮਤ ’ਤੇ ਖਰੀਦ ਸਕਦੇ ਹੋ।',
    negotiate: 'ਭਾਅ ਮੁੱਲ ਕਰੋ',
    dealTitle: 'ਚੱਲੋ ਸੌਦਾ ਕਰੀਏ',
    skip: 'ਛੱਡੋ — ਪੂਰੀ ਕੀਮਤ ’ਤੇ ਖਰੀਦੋ →',
    aiPowered: 'AI-ਚਾਲਿਤ ਸੌਦੇਬਾਜ਼ੀ',
    attemptsLeft: '{n} ਬਾਕੀ',
    connecting: 'ਕਨੈਕਟ ਹੋ ਰਿਹਾ ਹੈ...',
    assistant: 'ਸਹਾਇਕ',
    notice: 'ਸੂਚਨਾ',
    offered: 'ਆਫਰ:',
    typeOffer: 'ਆਪਣਾ ਭਾਅ ਲਿਖੋ...',
    sessionEnded: 'ਸੈਸ਼ਨ ਖ਼ਤਮ',
    acceptDeal: 'ਸੌਦਾ ਸਵੀਕਾਰ ਕਰੋ ਅਤੇ ਕੋਡ ਲਵੋ',
    dealComplete: '✓ ਸੌਦਾ ਪੂਰਾ',
    youSaved: 'ਤੁਸੀਂ ਬਚਾਏ {x}!',
    newPrice: 'ਨਵੀਂ ਕੀਮਤ:',
    copy: 'ਕਾਪੀ',
    codeApply: 'ਕੋਡ ਚੈੱਕਆਊਟ ’ਤੇ ਆਪਣੇ-ਆਪ ਲਾਗੂ ਹੋਵੇਗਾ।',
    optOutMsg: 'ਕੋਈ ਗੱਲ ਨਹੀਂ — ਤੁਸੀਂ ਰੈਗੂਲਰ ਕੀਮਤ ’ਤੇ ਖਰੀਦ ਸਕਦੇ ਹੋ। ਤੁਸੀਂ AI ਕੀਮਤ-ਨਿਰਧਾਰਨ ਤੋਂ ਬਾਹਰ ਹੋ ਗਏ।',
  },
}

export function uiText(
  lang: string | undefined | null,
  key: UiKey,
  vars?: Record<string, string | number>,
): string {
  const table = (lang && (I18N as Record<string, Record<UiKey, string>>)[lang]) || I18N.en
  let s = table[key] ?? I18N.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return s
}