/**
 * Lightweight client-safe detection of the language a customer is typing in.
 * Used to make the negotiator reply in the same language the customer speaks
 * (auto-mirror). Heuristic + Unicode-script based — no dictionaries, no I/O.
 *
 * Returns one of the engine's SUPPORTED_LANGUAGES codes, or null when
 * undetectable (only numbers/emoji, or an out-of-coverage script).
 */
export const DETECTABLE_LANGS = [
  'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'pa', 'kn', 'ml', 'or', 'hinglish', 'en',
] as const

const DEVANAGARI = /[\u0900-\u097F]/
const BENGALI = /[\u0980-\u09FF]/
const GURMUKHI = /[\u0A00-\u0A7F]/
const GUJARATI = /[\u0A80-\u0AFF]/
const ODIA = /[\u0B00-\u0B7F]/
const TAMIL = /[\u0B80-\u0BFF]/
const TELUGU = /[\u0C00-\u0C7F]/
const KANNADA = /[\u0C80-\u0CFF]/
const MALAYALAM = /[\u0D00-\u0D7F]/
const LATIN = /[A-Za-z]/

// High-signal Marathi particles that distinguish Devanagari script as Marathi
// rather than Hindi (Hindi would use है/नहीं/मुझे/कितना etc). Note: \b word
// boundaries do NOT work on non-ASCII scripts, hence plain substring match.
const MARATHI_MARKERS = /आहे|नाही|मला|किती|करूया|झालं|माझं|असेल|नको/

// High-frequency Hindi/Hinglish words in Roman script. A Latin-message with any
// of these leans Hinglish; a clean Latin message without them is plain English.
const HINGLISH_WORDS = [
  'nahi', 'hai', 'hain', 'bhai', 'bhaiya', 'acha', 'accha', 'theek', 'yaar',
  'karo', 'karein', 'karna', 'batao', 'bata', 'chalega', 'chahiye', 'chahi',
  'dega', 'degi', 'lunga', 'lugi', 'paisa', 'paise', 'rupaye', 'thoda',
  'bahut', 'bhagwan', 'waala', 'aaunga', 'karunga', 'maan', 'manega',
  'dogi', 'dogey', 'bhaiyo',
]

type DetectedLanguage = 'hi' | 'mr' | 'ta' | 'te' | 'bn' | 'gu' | 'pa' | 'kn' | 'ml' | 'or' | 'hinglish' | 'en'

const LANGUAGE_REQUESTS: { code: DetectedLanguage; re: RegExp }[] = [
  { code: 'hi', re: /(?:हिन्दी|हिंदी)/ },
  { code: 'hinglish', re: /\b(?:hindi(?:\s+(?:m|me|mein))?|hinglish|roman\s+hindi|hinglish\s+me(?:in)?)\b/i },
  { code: 'mr', re: /(?:\b(?:marathi|marāṭhī)\b|मराठी)/i },
  { code: 'ta', re: /(?:\btamil\b|தமிழ்)/i },
  { code: 'te', re: /(?:\btelugu\b|తెలుగు)/i },
  { code: 'bn', re: /(?:\bbengali\b|\bbangla\b|বাংলা)/i },
  { code: 'gu', re: /(?:\bgujarati\b|ગુજરાતી)/i },
  { code: 'pa', re: /(?:\bpunjabi\b|ਪੰਜਾਬੀ)/i },
  { code: 'kn', re: /(?:\bkannada\b|ಕನ್ನಡ)/i },
  { code: 'ml', re: /(?:\bmalayalam\b|മലയാളം)/i },
  { code: 'or', re: /(?:\bodia\b|\boriya\b|ଓଡ଼ିଆ)/i },
  { code: 'en', re: /\b(?:english|in\s+english)\b/i },
]

const LANGUAGE_SWITCH_CUE =
  /(?:\b(?:bolo|bol|bole|baat|bat|batao|bata|kar|karo|kro|karna|speak|talk|reply|answer|write|use|switch|change|mein|me|m)\b)|(?:बात|बोल|बोलो|बताओ|बता|करो|करें|में|मे)/i

/**
 * Detect an explicit "talk in Hindi/Marathi/…" instruction. This must win over
 * a merchant's configured language and over ordinary script detection, otherwise
 * a shopper asking "hindi m bat kro" keeps getting the old language forever.
 */
export function detectLanguageRequest(text: string): DetectedLanguage | null {
  if (!text || !text.trim()) return null
  const cleaned = text.trim()
  if (cleaned.length > 100) return null
  for (const { code, re } of LANGUAGE_REQUESTS) {
    if (!re.test(cleaned)) continue
    if (LANGUAGE_SWITCH_CUE.test(cleaned) || cleaned.split(/\s+/).length <= 6) return code
  }
  return null
}

export function detectLanguage(text: string): 'hi' | 'mr' | 'ta' | 'te' | 'bn' | 'gu' | 'pa' | 'kn' | 'ml' | 'or' | 'hinglish' | 'en' | null {
  if (!text || !text.trim()) return null

  if (DEVANAGARI.test(text)) return MARATHI_MARKERS.test(text) ? 'mr' : 'hi'
  if (TAMIL.test(text)) return 'ta'
  if (TELUGU.test(text)) return 'te'
  if (BENGALI.test(text)) return 'bn'
  if (GUJARATI.test(text)) return 'gu'
  if (GURMUKHI.test(text)) return 'pa'
  if (KANNADA.test(text)) return 'kn'
  if (MALAYALAM.test(text)) return 'ml'
  if (ODIA.test(text)) return 'or'

  if (LATIN.test(text)) {
    const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
    const hasHinglish = words.some((w) => HINGLISH_WORDS.includes(w))
    return hasHinglish ? 'hinglish' : 'en'
  }

  return null
}