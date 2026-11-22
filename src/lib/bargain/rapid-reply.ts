export const RAPID_REPLY_MODES = [
  'greeting',
  'small_talk',
  'emoji_only',
  'nonsense',
  'off_topic',
  'probe',
  'insult',
] as const

export type RapidReplyMode = (typeof RAPID_REPLY_MODES)[number]

export interface RapidReplyInput {
  mode: string
  language?: string | null
  productTitle?: string | null
  emojiBudget?: number
}

export interface RapidReplyResult {
  reply: string
  decision: 'chat'
  tactic: 'rapid_reply'
  sentiment: 'neutral'
  metadata: {
    aiSource: 'reflex'
    aiFallbackReason: 'rapid_low_information'
    rapidReply: true
    liveTurnMode: string
  }
}

type Copy = Record<RapidReplyMode, string>

const EN: Copy = {
  greeting: 'Hey! Tell me what you are looking for, or name your price — I will keep it quick.',
  small_talk: 'Sure — what would you like to know about {item}, or what price do you have in mind?',
  emoji_only: '🙂 What would you like to know — product details or your price?',
  nonsense: "Sorry, I didn't catch that. Tell me what you need about {item}, or share your price.",
  off_topic: "Let's stay on track. A question about {item}, or the price you have in mind?",
  probe: "I'm here to help with this item and its price. Ask me about the product or make an offer.",
  insult: "Let's keep it respectful. I'm happy to help with {item} when you are ready.",
}

const HINGLISH: Copy = {
  greeting: 'Namaste! Bataiye aap kya chahte hain, ya apna price bata dijiye — main jaldi madad karunga.',
  small_talk: 'Bilkul — {item} ke baare mein kya jaanna chahte hain, ya aapka kya budget hai?',
  emoji_only: '🙂 Bataiye, product details chahiye ya apna price?',
  nonsense: 'Sorry, samajh nahi aaya. {item} ke baare mein kya chahte hain, ya price bata dijiye?',
  off_topic: 'Chalo, wapas topic par. {item} ke baare mein poochhiye ya price bataiye.',
  probe: 'Main is item aur iske price mein madad karne ke liye yahin hoon. Product ke baare mein poochhiye ya offer dijiye.',
  insult: 'Chalo, respectful rehte hain. Jab aap ready hon, {item} mein madad kar dunga.',
}

const HI: Copy = {
  greeting: 'नमस्ते! बताइए आप क्या चाहते हैं, या अपना मूल्य बता दीजिए — मैं जल्दी मदद करूँगा।',
  small_talk: 'ज़रूर — {item} के बारे में क्या जानना चाहेंगे, या आपका क्या बजट है?',
  emoji_only: '🙂 बताइए, उत्पाद की जानकारी चाहिए या आपका मूल्य?',
  nonsense: 'क्षमा करें, समझ नहीं आया। {item} के बारे में क्या चाहते हैं, या मूल्य बता दीजिए?',
  off_topic: 'चलिए, विषय पर वापस आते हैं। {item} के बारे में पूछें या मूल्य बताइए।',
  probe: 'मैं इस उत्पाद और उसके मूल्य में मदद करने के लिए यहाँ हूँ। उत्पाद के बारे में पूछें या प्रस्ताव दें।',
  insult: 'आइए, सम्मानजनक रहें। जब आप तैयार हों, मैं {item} में मदद करूँगा।',
}

const TA: Copy = {
  greeting: 'வணக்கம்! உங்களுக்கு என்ன வேண்டும் என்று சொல்லுங்கள், அல்லது உங்கள் விலையைச் சொல்லுங்கள் — நான் விரைவாக உதவுவேன்.',
  small_talk: 'சரி — {item} பற்றி என்ன தெரிந்துகொள்ள விரும்புகிறீர்கள், அல்லது உங்கள் விலை என்ன?',
  emoji_only: '🙂 பொருள் விவரங்களா, உங்கள் விலையா?',
  nonsense: 'மன்னிக்கவும், புரியவில்லை. {item} பற்றி என்ன வேண்டும், அல்லது விலையைச் சொல்லுங்கள்.',
  off_topic: 'விஷயத்திற்கு வருவோம். {item} பற்றி கேளுங்கள் அல்லது விலை சொல்லுங்கள்.',
  probe: 'இந்த பொருள் மற்றும் அதன் விலையில் உதவ நான் இங்கே இருக்கிறேன். கேள்வி கேளுங்கள் அல்லது விலை சொல்லுங்கள்.',
  insult: 'மரியாதையாக இருக்கலாம். நீங்கள் தயாரானபோது {item} உதவி செய்வேன்.',
}

const TE: Copy = {
  greeting: 'నమస్తే! మీకు ఏమి కావాలో చెప్పండి, లేదా మీ ధర చెప్పండి — నేను వెంటనే సహాయం చేస్తాను.',
  small_talk: 'సరే — {item} గురించి ఏమి తెలుసుకోవాలనుకుంటున్నారు, లేదా మీ ధర ఎంత?',
  emoji_only: '🙂 ఉత్పత్తి వివరాలా, మీ ధరా?',
  nonsense: 'క్షమించండి, అర్థం కాలేదు. {item} గురించి ఏమి కావాలో చెప్పండి, లేదా ధర చెప్పండి.',
  off_topic: 'విషయానికి వద్దాం. {item} గురించి అడగండి లేదా ధర చెప్పండి.',
  probe: 'ఈ ఉత్పత్తి మరియు దాని ధరలో సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను. ప్రశ్న అడగండి లేదా ఆఫర్ చేయండి.',
  insult: 'గౌరవంగా ఉందాం. మీరు సిద్ధంగా ఉన్నప్పుడు {item} లో సహాయం చేస్తాను.',
}

const BN: Copy = {
  greeting: 'নমস্কার! আপনি কী চান বলুন, অথবা আপনার দাম বলুন — আমি দ্রুত সাহায্য করব।',
  small_talk: 'ঠিক আছে — {item} সম্পর্কে কী জানতে চান, অথবা আপনার দাম কত?',
  emoji_only: '🙂 পণ্যের বিবরণ চাই, নাকি আপনার দাম?',
  nonsense: 'দুঃখিত, বুঝতে পারিনি। {item} সম্পর্কে কী চান, অথবা দাম বলুন।',
  off_topic: 'চলুন, বিষয়ে ফিরে আসি। {item} সম্পর্কে জিজ্ঞাসা করুন অথবা দাম বলুন।',
  probe: 'আমি এই পণ্য ও এর দামে সাহায্য করতে এখানে আছি। প্রশ্ন করুন অথবা অফার দিন।',
  insult: 'চলুন, শ্রদ্ধাশীল থাকি। আপনি প্রস্তুত হলে {item} সাহায্য করব।',
}

const MR: Copy = {
  greeting: 'नमस्कार! तुम्हाला काय हवे ते सांगा, किंवा तुमची किंमत सांगा — मी लवकर मदत करेन.',
  small_talk: 'नक्कीच — {item} बद्दल काय जाणून घ्यायचे आहे, किंवा तुमचा बजेट काय आहे?',
  emoji_only: '🙂 उत्पादनाची माहिती हवी आहे, की तुमची किंमत?',
  nonsense: 'क्षमस्व, समजले नाही. {item} बद्दल काय हवे आहे, किंवा किंमत सांगा.',
  off_topic: 'चला, विषयावर येऊया. {item} बद्दल विचारा किंवा किंमत सांगा.',
  probe: 'मी या उत्पादनाच्या किंमतीत मदत करण्यासाठी इथे आहे. प्रश्न विचारा किंवा ऑफर द्या.',
  insult: 'चला, आदराने राहूया. तुम्ही तयार झाल्यावर {item} मदत करेन.',
}

const GU: Copy = {
  greeting: 'નમસ્તે! તમે શું ઇચ્છો છો તે કહો, અથવા તમારી કિંમત કહો — હું ઝડપથી મદદ કરીશ.',
  small_talk: 'ચોક્કસ — {item} વિશે શું જાણવું છે, કે તમારું બજેટ શું છે?',
  emoji_only: '🙂 ઉત્પાદનની માહિતી જોઈએ છે, કે તમારી કિંમત?',
  nonsense: 'માફ કરશો, સમજાયું નહીં. {item} વિશે શું જોઈએ છે, કે કિંમત કહો?',
  off_topic: 'ચાલો, વિષય પર આવીએ. {item} વિશે પૂછો કે કિંમત કહો.',
  probe: 'હું આ ઉત્પાદન અને તેની કિંમતમાં મદદ કરવા અહીં છું. પ્રશ્ન પૂછો કે ઑફર આપો.',
  insult: 'ચાલો, આદરપૂર્વક રહીએ. તમે તૈયાર થાઓ એટલે {item} માં મદદ કરીશ.',
}

const PA: Copy = {
  greeting: 'ਨਮਸਤੇ! ਦੱਸੋ ਤੁਸੀਂ ਕੀ ਚਾਹੁੰਦੇ ਹੋ, ਜਾਂ ਆਪਣੀ ਕੀਮਤ ਦੱਸੋ — ਮੈਂ ਜਲਦੀ ਮਦਦ ਕਰਾਂਗਾ।',
  small_talk: 'ਜ਼ਰੂਰ — {item} ਬਾਰੇ ਕੀ ਜਾਣਨਾ ਚਾਹੁੰਦੇ ਹੋ, ਜਾਂ ਤੁਹਾਡਾ ਬਜਟ ਕੀ ਹੈ?',
  emoji_only: '🙂 ਉਤਪਾਦ ਦੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ, ਜਾਂ ਤੁਹਾਡੀ ਕੀਮਤ?',
  nonsense: 'ਮਾਫ਼ ਕਰੋ, ਸਮਝ ਨਹੀਂ ਆਇਆ। {item} ਬਾਰੇ ਕੀ ਚਾਹੁੰਦੇ ਹੋ, ਜਾਂ ਕੀਮਤ ਦੱਸੋ?',
  off_topic: "ਆਓ, ਵਿਸ਼ੇ 'ਤੇ ਵਾਪਸ ਆਈਏ। {item} ਬਾਰੇ ਪੁੱਛੋ ਜਾਂ ਕੀਮਤ ਦੱਸੋ।",
  probe: 'ਮੈਂ ਇਸ ਉਤਪਾਦ ਅਤੇ ਇਸਦੀ ਕੀਮਤ ਵਿੱਚ ਮਦਦ ਕਰਨ ਲਈ ਇੱਥੇ ਹਾਂ। ਸਵਾਲ ਪੁੱਛੋ ਜਾਂ ਪੇਸ਼ਕਸ਼ ਕਰੋ।',
  insult: 'ਆਓ, ਸਤਿਕਾਰ ਨਾਲ ਰਹੀਏ। ਜਦੋਂ ਤੁਸੀਂ ਤਿਆਰ ਹੋਵੋ, ਮੈਂ {item} ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ।',
}

const COPY: Record<string, Copy> = {
  en: EN,
  hinglish: HINGLISH,
  hi: HI,
  ta: TA,
  te: TE,
  bn: BN,
  mr: MR,
  gu: GU,
  pa: PA,
}

const ITEM_WORD: Record<string, string> = {
  en: 'this item',
  hinglish: 'is item',
  hi: 'इस उत्पाद',
  ta: 'இந்த பொருள்',
  te: 'ఈ ఉత్పత్తి',
  bn: 'এই পণ্য',
  mr: 'या उत्पादनाच्या',
  gu: 'આ ઉત્પાદન',
  pa: 'ਇਸ ਉਤਪਾਦ',
}

function normalizedLang(language?: string | null): string {
  const value = (language ?? '').toLowerCase().replace(/[-_]/g, '')
  if (COPY[value]) return value
  if (value.startsWith('hi')) return 'hi'
  if (value.startsWith('hinglish')) return 'hinglish'
  return 'en'
}

function safeProductTitle(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned
}

export function isRapidReplyMode(mode: string): mode is RapidReplyMode {
  return (RAPID_REPLY_MODES as readonly string[]).includes(mode)
}

export function rapidReplyForTurn(input: RapidReplyInput): RapidReplyResult | null {
  if (!isRapidReplyMode(input.mode)) return null
  const lang = normalizedLang(input.language)
  const table = COPY[lang] ?? EN
  const product = safeProductTitle(input.productTitle) ?? ITEM_WORD[lang] ?? ITEM_WORD.en
  let reply = table[input.mode].replace('{item}', product)
  if ((input.emojiBudget ?? 0) <= 0) {
    reply = reply.replace(/^🙂\s*/, '')
  }
  return {
    reply,
    decision: 'chat',
    tactic: 'rapid_reply',
    sentiment: 'neutral',
    metadata: {
      aiSource: 'reflex',
      aiFallbackReason: 'rapid_low_information',
      rapidReply: true,
      liveTurnMode: input.mode,
    },
  }
}
