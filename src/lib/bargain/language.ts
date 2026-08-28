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