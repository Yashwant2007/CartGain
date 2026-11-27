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
  greeting: 'Hey there! 👋 Looking for details on {item}, or want to try a price?',
  small_talk: 'All good here 🙂 What would you like to know about {item}, or what price feels right?',
  emoji_only: '🙂 Got you. Want {item} details, or should we talk price?',
  nonsense: "I didn't quite catch that. Want help with {item}, or want to share a price?",
  random: "That came through a bit scrambled 😅 No worries  -  ask me about {item}, or drop a price you're thinking of.",
  off_topic: "Let's keep it on {item} for now. Product question, or a price you want me to check?",
  joke: "Haha, fair one 😄 Back to {item}  -  quick details, or your best price?",
  flattery: "That's kind of you 🙂 Let's make it useful  -  {item} details, or a price that works for you?",
  hesitation: "No rush at all. What's holding you back on {item}  -  fit, trust, or the price?",
  probe: "I'm here for {item} details and a fair deal. Ask me anything about it, or make an offer.",
  insult: "I'm happy to keep this helpful and respectful. When you're ready, I can help with {item} or your offer.",
  trend_talk: "Nice reference 😄 I won't guess what's trending, but for {item}  -  want details or a comfortable price?",
}

const HINGLISH: Copy = {
  greeting: 'Hey! 👋 {item} ke baare mein puchna hai, ya apna price batana hai?',
  small_talk: 'Sab badhiya 🙂 {item} ke baare mein kya jaan-na hai, ya kya price sahi lagega?',
  emoji_only: '🙂 Samajh gaya. {item} ki details chahiye ya apna price?',
  nonsense: 'Yeh thoda clear nahi hua. {item} ke baare mein help chahiye, ya price share karoge?',
  random: 'Thoda scrambled aa gaya 😅 Koi baat nahi  -  {item} ka sawaal pucho ya apna price batao.',
  off_topic: 'Chalo {item} par wapas aate hain. Koi question hai, ya price batana hai?',
  joke: 'Haha, sahi hai 😄 Ab {item} ki baat  -  details chahiye ya best price check karun?',
  flattery: 'Shukriya 🙂 Ab kaam ki baat  -  {item} ke baare mein kya jaana hai, ya price kya socha hai?',
  hesitation: 'Koi jaldi nahi. {item} mein kya soch mein daal raha hai  -  fit, trust, ya price?',
  probe: 'Main {item} aur uske price mein help kar sakta hoon. Product pucho ya apna offer do.',
  insult: 'Main respectfully help karna chahta hoon. Jab ready ho, {item} ya price par baat karte hain.',
  trend_talk: 'Reference mast tha 😄 Trend ka claim nahi karunga, par {item} pe  -  details chahiye ya comfortable price?',
}

function normalizedLang(language?: string | null): string {
  const raw = (language || 'en').toLowerCase().trim()
  if (raw === 'hinglish' || raw === 'hi-en' || raw === 'en-hi') return 'hinglish'
  if (raw.startsWith('hi')) return 'hi'
  if (raw.startsWith('mr')) return 'mr'
  return 'en'
}

function safeProductTitle(title?: string | null): string | null {
  const clean = (title || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean || null
}

const ITEM_WORD: Record<string, string> = { en: "this item", hi: "yeh item", mr: "ha item", hinglish: "yeh item" }
const COPY: Record<string, Copy> = { en: EN, hi: HINGLISH, mr: EN, hinglish: HINGLISH }

const CONTEXT_TREND_COPY: Record<ContextFlavor, Partial<Record<string, string>>> = {
  political: {
    en: "Nice reference 😄 I'll stay neutral and keep it friendly 🔥 For {item}, what price actually works for you?",
    hinglish: "Reference samajh gaya 😄 main neutral rehta hoon; {item} par aapka comfortable price kya hoga?",
    hi: "Reference samajh gaya 😄 main neutral rahunga; {item} ke liye aapka comfortable price kya hoga?",
  },
  devotional: {
    en: "I get the good-vibes reference 😄 For {item}, what price feels right to you?",
    hinglish: "Achhe vibes wala reference samajh gaya 😄 {item} ka deal clear karte hain, aapka price kya hoga?",
    hi: "Achhe vibes wala reference samajh gaya 😄 {item} par aapka comfortable price kya hoga?",
  },
  fashion: {
    en: "Style point noted 🔥 For {item}, what price works for you?",
    hinglish: "Style point noted 🔥 {item} ka price settle karte hain, aapka price kya hoga?",
    hi: "Style point noted 🔥 {item} ke liye aapka comfortable price kya hoga?",
  },
  meme: {
    en: "Meme mode on 😄 For {item}, give me your best price — I deliver deals, not punchlines.",
    hinglish: "Meme mode on 😄 {item} ke liye aapka best price bataiye — main punchline nahi, deal deliver karta hoon.",
  },
  sport: {
    en: "Nice reference 🔥 For {item}, what price should I aim for?",
    hinglish: "Ye reference solid hai 🔥 {item} par aapka best price kya hoga?",
    hi: "Reference samajh gaya 🔥 {item} ke liye aapka best price kya hoga?",
  },
  soft_nudge: {
    en: "You want a little more room — fair enough 😄 For {item}, what price can you actually do?",
    hinglish: "Thoda aur comfort chahiye, samajh gaya 😄 {item} par aapka actual price kya hoga?",
    hi: "Thoda aur comfort chahiye, samajh gaya 😄 {item} ke liye aapka actual price kya hoga?",
  },
  casual: {
    en: "Nice reference 😄 Want {item} details, or your best price?",
    hinglish: "Vibe samajh gaya 😄 {item} ke baare mein poochhiye ya apna best price bata dijiye.",
    hi: "Vibe samajh gaya 😄 {item} ke baare mein puchiye ya apna best price bataiye.",
  },
}

const POLITICAL_NUDGE_COPY: Partial<Record<string, string>> = {
  en: "Nice nudge 😄 I'll stay neutral, but I hear you 🔥 For {item}, what price can you genuinely do?",
  hinglish: "Reference samajh gaya 😄 main neutral rehta hoon; thoda aur comfort bhi samajh gaya 🔥 {item} par aapka comfortable price kya hoga?",
  hi: "Reference samajh gaya 😄 main neutral rahunga; thoda aur comfort bhi samajh gaya 🔥 {item} ke liye aapka comfortable price kya hoga?",
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
