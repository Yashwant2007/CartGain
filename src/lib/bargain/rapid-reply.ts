import { detectContextFlavors, type ContextFlavor } from './context-flavor'

export const RAPID_REPLY_MODES = [
  'greeting',
  'small_talk',
  'emoji_only',
  'nonsense',
  'random',
  'off_topic',
  'joke',
  'flattery',
  'hesitation',
  'probe',
  'insult',
  'trend_talk',
] as const

export type RapidReplyMode = (typeof RAPID_REPLY_MODES)[number]

export interface RapidReplyInput {
  mode: string
  language?: string | null
  productTitle?: string | null
  emojiBudget?: number
  message?: string | null
  contextFlavor?: ContextFlavor | null
  contextFlavors?: ContextFlavor[] | null
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
    contextFlavor: ContextFlavor | null
    contextFlavors: ContextFlavor[]
  }
}

type Copy = Partial<Record<RapidReplyMode, string>>

const EN: Copy = {
  greeting: 'Hey! Tell me what you are looking for, or name your price — I will keep it quick.',
  small_talk: 'Sure — what would you like to know about {item}, or what price do you have in mind?',
  emoji_only: '🙂 What would you like to know — product details or your price?',
  nonsense: "Sorry, I didn't catch that. Tell me what you need about {item}, or share your price.",
  random: "That came through a bit scrambled. No worries — what would you like to know about {item}, or what price are you thinking?",
  off_topic: "Let's stay on track. A question about {item}, or the price you have in mind?",
  joke: "Ha, fair — I will keep it light. On {item}, would you like the quick details or your best price checked?",
  flattery: "Thanks, that is kind. I will keep this useful: what would you like to know about {item}, or what price do you have in mind?",
  hesitation: "No rush. What is holding you back on {item} — fit, trust, or the number?",
  probe: "I'm here to help with this item and its price. Ask me about the product or make an offer.",
  insult: "Let's keep it respectful. I'm happy to help with {item} when you are ready.",
  trend_talk: "Nice reference — I won't pretend to know what is trending. Want {item} details, or a price you're comfortable with?",
}

const HINGLISH: Copy = {
  greeting: 'Namaste! Bataiye aap kya chahte hain, ya apna price bata dijiye — main jaldi madad karunga.',
  small_talk: 'Bilkul — {item} ke baare mein kya jaanna chahte hain, ya aapka kya budget hai?',
  emoji_only: '🙂 Bataiye, product details chahiye ya apna price?',
  nonsense: 'Sorry, samajh nahi aaya. {item} ke baare mein kya chahte hain, ya price bata dijiye?',
  random: 'Thoda sa confusing aa gaya, koi baat nahi. {item} ke baare mein kya jaanna chahte hain, ya kya price soch rahe hain?',
  off_topic: 'Chalo, wapas topic par. {item} ke baare mein poochhiye ya price bataiye.',
  joke: 'Haha, theek — main bhi light rakhta hoon. {item} ki quick details chahiye ya apna best price check karana hai?',
  flattery: 'Thanks, bahut kind baat hai. Ab useful rehte hain — {item} ke baare mein kya jaanna hai, ya kya price soch rahe hain?',
  hesitation: 'Koi jaldi nahi. {item} mein kya rok raha hai — fit, trust, ya number?',
  probe: 'Main is item aur iske price mein madad karne ke liye yahin hoon. Product ke baare mein poochhiye ya offer dijiye.',
  insult: 'Chalo, respectful rehte hain. Jab aap ready hon, {item} mein madad kar dunga.',
  trend_talk: 'Accha reference hai — main trend ka dava nahi karta. {item} ki details chahiye, ya apna price?',
}

const HI: Copy = {
  greeting: 'नमस्ते! बताइए आप क्या चाहते हैं, या अपना मूल्य बता दीजिए — मैं जल्दी मदद करूँगा।',
  small_talk: 'ज़रूर — {item} के बारे में क्या जानना चाहेंगे, या आपका क्या बजट है?',
  emoji_only: '🙂 बताइए, उत्पाद की जानकारी चाहिए या आपका मूल्य?',
  nonsense: 'क्षमा करें, समझ नहीं आया। {item} के बारे में क्या चाहते हैं, या मूल्य बता दीजिए?',
  random: 'थोड़ा अस्पष्ट आ गया, कोई बात नहीं। {item} के बारे में क्या जानना चाहेंगे, या क्या मूल्य सोच रहे हैं?',
  off_topic: 'चलिए, विषय पर वापस आते हैं। {item} के बारे में पूछें या मूल्य बताइए।',
  joke: 'हाहा, ठीक — मैं भी हल्का रखूँगा। {item} की संक्षिप्त जानकारी चाहिए या अपना सर्वश्रेष्ठ मूल्य जाँचवाना है?',
  flattery: 'धन्यवाद, यह बहुत दयालु बात है। अब उपयोगी रहते हैं — {item} के बारे में क्या जानना है, या क्या मूल्य सोच रहे हैं?',
  hesitation: 'कोई जल्दी नहीं। {item} में क्या रोक रहा है — फिट, भरोसा, या मूल्य?',
  probe: 'मैं इस उत्पाद और उसके मूल्य में मदद करने के लिए यहाँ हूँ। उत्पाद के बारे में पूछें या प्रस्ताव दें।',
  insult: 'आइए, सम्मानजनक रहें। जब आप तैयार हों, मैं {item} में मदद करूँगा।',
  trend_talk: 'शानदार संदर्भ — मैं ट्रेंड का दावा नहीं करूँगा। {item} की जानकारी चाहिए, या आपका मूल्य?',
}

const TA: Copy = {
  greeting: 'வணக்கம்! உங்களுக்கு என்ன வேண்டும் என்று சொல்லுங்கள், அல்லது உங்கள் விலையைச் சொல்லுங்கள் — நான் விரைவாக உதவுவேன்.',
  small_talk: 'சரி — {item} பற்றி என்ன தெரிந்துகொள்ள விரும்புகிறீர்கள், அல்லது உங்கள் விலை என்ன?',
  emoji_only: '🙂 பொருள் விவரங்களா, உங்கள் விலையா?',
  nonsense: 'மன்னிக்கவும், புரியவில்லை. {item} பற்றி என்ன வேண்டும், அல்லது விலையைச் சொல்லுங்கள்.',
  off_topic: 'விஷயத்திற்கு வருவோம். {item} பற்றி கேளுங்கள் அல்லது விலை சொல்லுங்கள்.',
  probe: 'இந்த பொருள் மற்றும் அதன் விலையில் உதவ நான் இங்கே இருக்கிறேன். கேள்வி கேளுங்கள் அல்லது விலை சொல்லுங்கள்.',
  insult: 'மரியாதையாக இருக்கலாம். நீங்கள் தயாரானபோது {item} உதவி செய்வேன்.',
  trend_talk: 'நல்ல குறிப்பு — ட்ரெண்ட் பற்றி நான் உறுதி சொல்ல மாட்டேன். {item} விவரங்களா, ఉங்கள் விலையா?',
}

const TE: Copy = {
  greeting: 'నమస్తే! మీకు ఏమి కావాలో చెప్పండి, లేదా మీ ధర చెప్పండి — నేను వెంటనే సహాయం చేస్తాను.',
  small_talk: 'సరే — {item} గురించి ఏమి తెలుసుకోవాలనుకుంటున్నారు, లేదా మీ ధర ఎంత?',
  emoji_only: '🙂 ఉత్పత్తి వివరాలా, మీ ధరా?',
  nonsense: 'క్షమించండి, అర్థం కాలేదు. {item} గురించి ఏమి కావాలో చెప్పండి, లేదా ధర చెప్పండి.',
  off_topic: 'విషయానికి వద్దాం. {item} గురించి అడగండి లేదా ధర చెప్పండి.',
  probe: 'ఈ ఉత్పత్తి మరియు దాని ధరలో సహాయం చేయడానికి నేను ఇక్కడ ఉన్నాను. ప్రశ్న అడగండి లేదా ఆఫర్ చేయండి.',
  insult: 'గౌరవంగా ఉందాం. మీరు సిద్ధంగా ఉన్నప్పుడు {item} లో సహాయం చేస్తాను.',
  trend_talk: 'మంచి సూచన — ట్రెండ్ గురించి నేను నిర్ధారణ చేయను. {item} వివరాలా, మీ ధరా?',
}

const BN: Copy = {
  greeting: 'নমস্কার! আপনি কী চান বলুন, অথবা আপনার দাম বলুন — আমি দ্রুত সাহায্য করব।',
  small_talk: 'ঠিক আছে — {item} সম্পর্কে কী জানতে চান, অথবা আপনার দাম কত?',
  emoji_only: '🙂 পণ্যের বিবরণ চাই, নাকি আপনার দাম?',
  nonsense: 'দুঃখিত, বুঝতে পারিনি। {item} সম্পর্কে কী চান, অথবা দাম বলুন।',
  off_topic: 'চলুন, বিষয়ে ফিরে আসি। {item} সম্পর্কে জিজ্ঞাসা করুন অথবা দাম বলুন।',
  probe: 'আমি এই পণ্য ও এর দামে সাহায্য করতে এখানে আছি। প্রশ্ন করুন অথবা অফার দিন।',
  insult: 'চলুন, শ্রদ্ধাশীল থাকি। আপনি প্রস্তুত হলে {item} সাহায্য করব।',
  trend_talk: 'ভালো ইশারা — ট্রেন্ড নিয়ে আমি দাবি করব না। {item} বিবরণ চাই, নাকি আপনার দাম?',
}

const MR: Copy = {
  greeting: 'नमस्कार! तुम्हाला काय हवे ते सांगा, किंवा तुमची किंमत सांगा — मी लवकर मदत करेन.',
  small_talk: 'नक्कीच — {item} बद्दल काय जाणून घ्यायचे आहे, किंवा तुमचा बजेट काय आहे?',
  emoji_only: '🙂 उत्पादनाची माहिती हवी आहे, की तुमची किंमत?',
  nonsense: 'क्षमस्व, समजले नाही. {item} बद्दल काय हवे आहे, किंवा किंमत सांगा.',
  off_topic: 'चला, विषयावर येऊया. {item} बद्दल विचारा किंवा किंमत सांगा.',
  probe: 'मी या उत्पादनाच्या किंमतीत मदत करण्यासाठी इथे आहे. प्रश्न विचारा किंवा ऑफर द्या.',
  insult: 'चला, आदराने राहूया. तुम्ही तयार झाल्यावर {item} मदत करेन.',
  trend_talk: 'छान संदर्भ — ट्रेंडबद्दल मी दावा करणार नाही. {item} बद्दल माहिती हवी आहे, की तुमची किंमत?',
}

const GU: Copy = {
  greeting: 'નમસ્તે! તમે શું ઇચ્છો છો તે કહો, અથવા તમારી કિંમત કહો — હું ઝડપથી મદદ કરીશ.',
  small_talk: 'ચોક્કસ — {item} વિશે શું જાણવું છે, કે તમારું બજેટ શું છે?',
  emoji_only: '🙂 ઉત્પાદનની માહિતી જોઈએ છે, કે તમારી કિંમત?',
  nonsense: 'માફ કરશો, સમજાયું નહીં. {item} વિશે શું જોઈએ છે, કે કિંમત કહો?',
  off_topic: 'ચાલો, વિષય પર આવીએ. {item} વિશે પૂછો કે કિંમત કહો.',
  probe: 'હું આ ઉત્પાદન અને તેની કિંમતમાં મદદ કરવા અહીં છું. પ્રશ્ન પૂછો કે ઑફર આપો.',
  insult: 'ચાલો, આદરપૂર્વક રહીએ. તમે તૈયાર થાઓ એટલે {item} માં મદદ કરીશ.',
  trend_talk: 'સારો સંદર્ભ — ટ્રેન્ડ વિશે હું દાવો કરીશ નહીં. {item} વિશે માહિતી જોઈએ છે, કે તમારી કિંમત?',
}

const PA: Copy = {
  greeting: 'ਨਮਸਤੇ! ਦੱਸੋ ਤੁਸੀਂ ਕੀ ਚਾਹੁੰਦੇ ਹੋ, ਜਾਂ ਆਪਣੀ ਕੀਮਤ ਦੱਸੋ — ਮੈਂ ਜਲਦੀ ਮਦਦ ਕਰਾਂਗਾ।',
  small_talk: 'ਜ਼ਰੂਰ — {item} ਬਾਰੇ ਕੀ ਜਾਣਨਾ ਚਾਹੁੰਦੇ ਹੋ, ਜਾਂ ਤੁਹਾਡਾ ਬਜਟ ਕੀ ਹੈ?',
  emoji_only: '🙂 ਉਤਪਾਦ ਦੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ, ਜਾਂ ਤੁਹਾਡੀ ਕੀਮਤ?',
  nonsense: 'ਮਾਫ਼ ਕਰੋ, ਸਮਝ ਨਹੀਂ ਆਇਆ। {item} ਬਾਰੇ ਕੀ ਚਾਹੁੰਦੇ ਹੋ, ਜਾਂ ਕੀਮਤ ਦੱਸੋ?',
  off_topic: "ਆਓ, ਵਿਸ਼ੇ 'ਤੇ ਵਾਪਸ ਆਈਏ। {item} ਬਾਰੇ ਪੁੱਛੋ ਜਾਂ ਕੀਮਤ ਦੱਸੋ।",
  probe: 'ਮੈਂ ਇਸ ਉਤਪਾਦ ਅਤੇ ਇਸਦੀ ਕੀਮਤ ਵਿੱਚ ਮਦਦ ਕਰਨ ਲਈ ਇੱਥੇ ਹਾਂ। ਸਵਾਲ ਪੁੱਛੋ ਜਾਂ ਪੇਸ਼ਕਸ਼ ਕਰੋ।',
  insult: 'ਆਓ, ਸਤਿਕਾਰ ਨਾਲ ਰਹੀਏ। ਜਦੋਂ ਤੁਸੀਂ ਤਿਆਰ ਹੋਵੋ, ਮੈਂ {item} ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ।',
  trend_talk: 'ਚੰਗਾ ਹਵਾਲਾ — ਟ੍ਰੈਂਡ ਬਾਰੇ ਮੈਂ ਦਾਅਵਾ ਨਹੀਂ ਕਰਾਂਗਾ। {item} ਬਾਰੇ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ, ਜਾਂ ਤੁਹਾਡੀ ਕੀਮਤ?',
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

const CONTEXT_TREND_COPY: Record<ContextFlavor, Partial<Record<string, string>>> = {
  political: {
    en: 'Nice reference — I will stay neutral, but I get the nudge 😄 For {item}, what price actually works for you? 🔥',
    hinglish: 'Reference samajh gaya 😄 — main neutral rehta hoon; {item} par aapka comfortable price kya hoga? 🔥',
    hi: 'रेफरेंस समझ गया 😄 — मैं तटस्थ रहता हूँ; {item} पर आपका comfortable प्राइस क्या होगा? 🔥',
  },
  devotional: {
    en: 'I get the good-vibes reference 😄 For {item}, what price feels right to you? 🔥',
    hinglish: 'Achhe vibes wala reference samajh gaya 🙏 — {item} ka deal clear karte hain, aapka price kya hoga? 🔥',
    hi: 'अच्छे विचारों वाला रेफरेंस समझ गया 🙏 — {item} की डील क्लियर करते हैं, आपका प्राइस क्या होगा? 🔥',
  },
  fashion: {
    en: 'Drip check passed 😄🔥 For {item}, what price works with that style?',
    hinglish: 'Drip check passed 😄🔥 {item} ka style aur price dono settle karte hain — aapka price kya hoga?',
    hi: 'ड्रिप चेक पास 😄🔥 {item} का स्टाइल और प्राइस दोनों सेटल करते हैं — आपका प्राइस क्या होगा?',
  },
  meme: {
    en: 'Meme mode on 😄 For {item}, give me your best price — I deliver deals, not punchlines 🔥',
    hinglish: 'Meme mode on 😄 {item} ke liye aapka best price bataiye — main punchline nahi, deal deliver karta hoon 🔥',
    hi: 'मीम मोड ऑन 😄 {item} के लिए आपका बेस्ट प्राइस बताइए — मैं पंचलाइन नहीं, डील डिलीवर करता हूँ 🔥',
  },
  sport: {
    en: 'That sports reference is a full toss 😄 For {item}, what price should I hit? 🔥',
    hinglish: 'Ye reference full toss hai 😄 {item} par aapka best price kya hoga? Main boundary cross karke deal closer kar dunga 🔥',
    hi: 'यह रेफरेंस फुल टॉस है 😄 {item} पर आपका बेस्ट प्राइस क्या होगा? मैं बाउंड्री क्रॉस करके डील क्लोज़ कर दूँगा 🔥',
  },
  soft_nudge: {
    en: 'You want a little more room — fair 😄 For {item}, what price can you actually honour? 🔥',
    hinglish: 'Thoda aur comfort chahiye — samajh gaya 😄 {item} par aapka actual price kya hoga? Main wahan tak aane ki koshish karunga 🔥',
    hi: 'थोड़ी और ढील चाहिए — समझ गया 😄 {item} पर आपका असली प्राइस क्या होगा? मैं वहाँ तक आने की कोशिश करूँगा 🔥',
  },
  casual: {
    en: 'Nice reference 😄 Want {item} details, or your best price? 🔥',
    hinglish: 'Vibe samajh gaya 😄 {item} ke baare mein poochhiye ya apna best price bata dijiye 🔥',
    hi: 'वाइब समझ गया 😄 {item} के बारे में पूछिए या अपना बेस्ट प्राइस बताइए 🔥',
  },
}

const POLITICAL_NUDGE_COPY: Partial<Record<string, string>> = {
  en: 'Nice nudge — I will stay neutral, but that was smooth 😄 For {item}, what price can you genuinely do? 🔥',
  hinglish: 'Reference century hai 😄 — main neutral rehta hoon; thoda aur comfort bhi samajh gaya. {item} par aapka comfortable price kya hoga? 🔥',
  hi: 'रेफरेंस शानदार है 😄 — मैं तटस्थ रहता हूँ; थोड़ी और ढील भी समझ गया। {item} पर आपका comfortable प्राइस क्या होगा? 🔥',
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

const EMOJI_G = /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF\u2B00-\u2BFF\uFE0F]/g

function applyEmojiBudget(reply: string, budget: number): string {
  const allowed = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0
  const found = reply.match(EMOJI_G) ?? []
  let remove = Math.max(0, found.length - allowed)
  const limited = reply.replace(EMOJI_G, (emoji) => (remove-- > 0 ? '' : emoji))
  return limited.replace(/\s{2,}/g, ' ').trim()
}

export function isRapidReplyMode(mode: string): mode is RapidReplyMode {
  return (RAPID_REPLY_MODES as readonly string[]).includes(mode)
}

export function rapidReplyForTurn(input: RapidReplyInput): RapidReplyResult | null {
  if (!isRapidReplyMode(input.mode)) return null
  const lang = normalizedLang(input.language)
  const table = COPY[lang] ?? EN
  const product = safeProductTitle(input.productTitle) ?? ITEM_WORD[lang] ?? ITEM_WORD.en
  const contextFlavors = Array.from(new Set(
    input.contextFlavors ?? (input.contextFlavor ? [input.contextFlavor] : detectContextFlavors(input.message)),
  ))
  const contextFlavor = contextFlavors[0] ?? null
  const combinedCopy = contextFlavor === 'political' && contextFlavors.includes('soft_nudge')
    ? POLITICAL_NUDGE_COPY[lang] ?? POLITICAL_NUDGE_COPY.en
    : null
  const contextCopy = input.mode === 'trend_talk'
    ? combinedCopy ?? (contextFlavor
      ? CONTEXT_TREND_COPY[contextFlavor][lang] ?? CONTEXT_TREND_COPY[contextFlavor].en
      : null)
    : null
  const source = contextCopy ?? table[input.mode] ?? EN[input.mode] ?? EN.small_talk ?? ''
  const reply = applyEmojiBudget(source.replace('{item}', product), input.emojiBudget ?? 0)
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
      contextFlavor,
      contextFlavors,
    },
  }
}
