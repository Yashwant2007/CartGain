// Deterministic shopper SOCIAL-SIGNAL analysis — the conversational-warmth
// layer that runs BEFORE the LLM, alongside intent (src/lib/bargain/intent.ts).
//
// Intent tells the AI WHAT the shopper is doing (price check, walkout, …).
// These signals tell the AI HOW the shopper is talking (by name, tersely,
// urgently, frustrated, politely, re-asking…) so the reply feels read and
// mirrored instead of blunt and scripted. Like intent, it is cheap,
// deterministic, and merchant-controllable — the LLM is told about each signal
// and how to respond to it; it never decides it.
//
// Pure functions: no Prisma, no OpenAI, safe to import anywhere.

export type CustomerEmotion =
  | 'frustrated'
  | 'skeptical'
  | 'hesitant'
  | 'apologetic'
  | 'playful'
  | 'excited'
  | 'neutral'

export interface SocialSignals {
  /** A name the shopper shared about THEMSELVES, if cleanly detectable. */
  name: string | null
  /** Opened with a greeting (hi/hey/hello/namaste…). */
  greeted: boolean
  /** Any politeness markers (please/thanks/could you/kindly…). */
  polite: boolean
  /** 3 words or fewer — wants a short answer, no small talk. */
  terse: boolean
  /** 40 words or more — expects detail. */
  verbose: boolean
  /** Time-sensitive framing (today/tomorrow/right now/asap…). */
  urgent: boolean
  /** The single dominant emotional read of the message. */
  emotion: CustomerEmotion
  /** Enthusiasm markers (!!, "love it", "great deal", emoji). */
  enthusiastic: boolean
  /** Heavy ALL-CAPS emphasis (often frustration/urgency). */
  capsEmphasis: boolean
  /** Demanding/imperative framing ("give me", "must be", "just do"). */
  directDemand: boolean
  /** Asks a question (contains ? or starts with a wh-word). */
  question: boolean
  /** Repeats a prior topic almost verbatim — a re-ask. */
  reasking: boolean
}

export interface SocialSignalInput {
  history?: { role: 'customer' | 'ai'; content: string }[]
  currentMessage: string
  /** Words/strings that must never be read as a name (product title, store, currency). */
  exclusions?: string[]
}

/** A signal profile with everything turned off/neutral — for defaults and tests. */
export function neutralSignals(): SocialSignals {
  return {
    name: null,
    greeted: false,
    polite: false,
    terse: false,
    verbose: false,
    urgent: false,
    emotion: 'neutral',
    enthusiastic: false,
    capsEmphasis: false,
    directDemand: false,
    question: false,
    reasking: false,
  }
}

// ── Name detection ─────────────────────────────────────────────────────────
// A name is only ever accepted when it is clearly self-referential ("i'm X",
// "my name is X", "this is X", "call me X"). Words that describe the shopper's
// state ("i'm looking…", "this is amazing") are rejected via the stop-list and
// the caller's exclusions (product title, store name, currency symbol).
const NAME_PATTERNS: RegExp[] = [
  /\b(?:i am|i'?m)\s+(?:called\s+)?([A-Za-z][A-Za-z.'-]{1,29})(?:\s+([A-Za-z][A-Za-z.'-]{1,29}))?\b/i,
  /\bmy name(?:'?s| is)\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s+([A-Za-z][A-Za-z.'-]{1,29}))?\b/i,
  /\bname(?:'?s| is)\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s+([A-Za-z][A-Za-z.'-]{1,29}))?\b/i,
  /\bthis is\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s+([A-Za-z][A-Za-z.'-]{1,29}))?\b/i,
  /\b(?:hi|hey|hello|hiya|namaste|namaskar)\b[^.!?]{0,24}\b(?:i am|i'?m|this is|my name(?:'?s| is))\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s+([A-Za-z][A-Za-z.'-]{1,29}))?\b/i,
  /\b(?:call me|they call me|people call me)\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s+([A-Za-z][A-Za-z.'-]{1,29}))?\b/i,
]

// Words shoppers use to describe themselves that are NOT names. Localized bits
// (bhai/dost/yaar) included — "i am your friend" must not become a name.
const NAME_STOPWORDS = new Set([
  'i', 'me', 'my', 'a', 'an', 'the', 'this', 'that', 'these', 'those', 'you', 'your', 'yours',
  'it', 'its', 'we', 'us', 'our', 'they', 'them', 'he', 'she', 'him', 'her',
  'so', 'just', 'only', 'very', 'really', 'too', 'sure', 'sorry', 'happy', 'ready', 'back',
  'done', 'fine', 'okay', 'great', 'good', 'better', 'cheaper', 'new', 'right', 'wrong',
  'here', 'there', 'now', 'today', 'tomorrow', 'tonight', 'little', 'bit', 'much', 'lot',
  'interested', 'looking', 'trying', 'hoping', 'wanting', 'needing', 'thinking', 'wondering',
  'saying', 'asking', 'seeing', 'checking', 'searching', 'browsing', 'buying', 'ordering',
  'final', 'straight', 'direct', 'serious', 'genuine', 'original', 'random', 'only',
  'friend', 'friends', 'bhai', 'dost', 'yaar', 'bhaiya', 'sir', 'madam', 'mam', 'bro', 'dude',
  'price', 'prices', 'budget', 'rate', 'amount', 'money', 'cost', 'deal', 'discount',
  'customer', 'buyer', 'person', 'guy', 'girl', 'man', 'woman', 'kid', 'johny', 'sale',
  'amazing', 'awesome', 'perfect', 'important', 'interesting', 'complicated',
])

// A captured word that leads a self-description is a state/negation word, not
// a name ("my name is not important…" / "i am not sure…" / "this is just…").
const NAME_NEGATION_PREFIX = new Set([
  'not', 'no', 'never', 'just', 'only', 'actually', 'really', 'honestly',
  'seriously', 'simply', 'sorry', 'quite', 'pretty', 'very', 'too', 'so',
])

const NAME_CLEAN = (raw: string): string => raw.trim().replace(/[.,!?;:]+$/, '').trim()

/** Deterministically detect a self-introduced name in a single message. */
export function extractName(message: string, exclusions: string[] = []): string | null {
  const cleaned = message.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  const excluded = new Set(
    exclusions
      .filter(Boolean)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  )

  for (const re of NAME_PATTERNS) {
    re.lastIndex = 0
    const m = re.exec(cleaned)
    if (!m) continue
    const parts: string[] = []
    const first = NAME_CLEAN(m[1])
    if (NAME_NEGATION_PREFIX.has(first.toLowerCase())) continue
    if (!isRejectedName(first, excluded)) parts.push(first)
    if (m[2]) {
      const second = NAME_CLEAN(m[2])
      if (parts.length > 0 && !isRejectedName(second, excluded)) parts.push(second)
    }
    // A two-part name where the second word is a stopword → drop it ("I am fine").
    if (parts.length >= 2 && NAME_STOPWORDS.has(parts[1].toLowerCase())) parts.pop()
    if (parts.length === 0) continue
    const name = parts.join(' ')
    if (/[A-Za-z]/.test(name) && name.length <= 30) return name
  }
  return null
}

function isRejectedName(word: string, exclusions: Set<string>): boolean {
  const w = word.toLowerCase()
  if (!/[A-Za-z]/.test(w)) return true // at least one letter (kills "₹50")
  if (/\d/.test(w)) return true // never a number
  if (NAME_STOPWORDS.has(w)) return true
  if (exclusions.has(w)) return true // product/store words are never names
  // A bare single consonant run (nonsense noise) shouldn't count as a name.
  if (w.length <= 1) return true
  return false
}

// ── Signal detection ───────────────────────────────────────────────────────
const RE = {
  greeting: /^\s*(hi|hiya|hey|heyy|hello|helo|namaste|namaskar|yo|good\s+(morning|afternoon|evening))\b/i,
  polite: /(please|pls|plz|pls\b|kindly|could\s+you|would\s+you|may\s+i|thanks|thank\s+you|thankyou|thank\s*u|ty\b|appreciat|bhaiya|dhanyavaad|shukriya)/i,
  urgent: /(right\s+now|asap|asap|urgent|immediately|immediate|tonight|today|tomorrow|sooner|this\s+(weekend|week)|need\s+it|by\s+(tonight|today|tomorrow|the\s+weekend))/i,
  frustrated:
    /\b(too|very|so|way)\s+(expensive|high|costly|steep)|can'?t\s+(afford|believe)|unfair|ridiculous|overpriced|outrageous|frustrat|annoy(ed|ing)?|u\s*serious|are\s+you\s+(kidding|serious)|this\s+is\s+(too\s+)?much|nah(,|!|\.)? |no\s+way|waste|kitna\s+expensive|bahut\s+mehnga|nahi\s+milega|too\s+much\b/i,
  skeptical: /really\?|too\s+good\s+to\s+be\s+true|is\s+this\s+(real|genuine|legit)|legit\?|suspicious|sounds\s+(fishy|fake)|scam|fake\?|sure\?|serious\?|authentic\?|original\?|genuine\?/i,
  hesitant:
    /i\s+(guess|think|suppose|maybe|imagine)|maybe|perhaps|not\s+(so\s+)?sure|not\s+really\s+sure|confused|hmm|kya\s+karun|soch(?:ta|ti|raha|rahi)|\bthink\s+about|let\s+me\s+(think|see|check)|weighing|little\s+(hesitant|unsure|tight)/i,
  apologetic: /\b(sorry|apolog(y|ies|ize|ise)|my\s+bad|excuse\s+me|pardon|maaf\s+(karo|kijiye))/i,
  playful: /(haha|lol|lmao|hehe|:\)|xd|😅|😄|😜|🤣|😂|jk\b|kidding|bro\b|dude\b|chalo|arre|yaar\b)/i,
  excited: /\b(amazing|awesome|excited|love\s+(it|this)|great\s+deal|yay|finally|wow|can'?t\s+wait|so\s+(happy|excited)|😍|dil\s+khus)/i,
  enthusiastic: /(!{2,}|exciting|party|dream)/i,
  direct: /\b(give\s+me|i\s+want\s+it|must\s+|have\s+to|need\s+it\s+(at|for)|why\s+not|just\s+(do|give|lower)|lower\s+it|maaf\s+karo|dedo|karo\b|chahiye|stop\s+bargaining|no\s+more\s+offers)\b/i,
  question: /[?？]|^\s*(what|why|how|can|could|do|does|did|is|are|will|would|should|may|any|kya|kaise|kyun)\b/i,
}

const TEXT_WORDS = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

function toGrams2(words: string[]): Set<string> {
  const grams = new Set<string>()
  for (let i = 0; i + 1 < words.length; i++) grams.add(`${words[i]} ${words[i + 1]}`)
  return grams
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b
  const larger = smaller === a ? b : a
  if (smaller.size === 0) return 0
  let hit = 0
  smaller.forEach((g) => { if (larger.has(g)) hit++ })
  return hit / smaller.size
}

/** Re-asking: the current message repeats a prior customer message's topic. */
function isReask(current: string, priorCustomerMessages: string[]): boolean {
  const cur = toGrams2(TEXT_WORDS(current))
  if (cur.size === 0) return false
  for (const prior of priorCustomerMessages) {
    const overlap = overlapRatio(cur, toGrams2(TEXT_WORDS(prior)))
    // Few shared words but high ratio relative to the SHORTER message = echo.
    if (overlap >= 0.5 && cur.size * (overlap) >= 1) return true
  }
  return false
}

function capsRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length < 8) return 0
  const upper = letters.replace(/[^A-Z]/g, '').length
  return upper / letters.length
}

/**
 * Analyze the shopper's current message (plus conversation history) for
 * conversational-warmth signals the AI should read and mirror.
 */
export function analyzeSocialSignals(input: SocialSignalInput): SocialSignals {
  const { currentMessage, exclusions = [] } = input
  const history = input.history ?? []
  const text = ` ${currentMessage.replace(/\s+/g, ' ').trim().toLowerCase()} `
  const hats = (key: keyof typeof RE): boolean => RE[key].test(text)

  // Name: prefer this message, else the earliest honestly-shared name in history.
  let name = extractName(currentMessage, exclusions)
  if (!name) {
    for (const m of history) {
      if (m.role !== 'customer') continue
      const found = extractName(m.content, exclusions)
      if (found) { name = found; break }
    }
  }

  const emotion: CustomerEmotion = hats('frustrated')
    ? 'frustrated'
    : hats('skeptical')
      ? 'skeptical'
      : hats('hesitant')
        ? 'hesitant'
        : hats('apologetic')
          ? 'apologetic'
          : hats('playful')
            ? 'playful'
            : hats('excited')
              ? 'excited'
              : 'neutral'

  const priorCustomerMessages = history.filter((m) => m.role === 'customer').map((m) => m.content)

  return {
    name,
    greeted: hats('greeting'),
    polite: hats('polite'),
    terse: currentMessage.trim().split(/\s+/).filter(Boolean).length <= 3,
    verbose: currentMessage.trim().split(/\s+/).filter(Boolean).length >= 40,
    urgent: hats('urgent'),
    emotion,
    enthusiastic: hats('enthusiastic') || hats('excited'),
    capsEmphasis: capsRatio(currentMessage) > 0.55,
    directDemand: hats('direct'),
    question: hats('question'),
    reasking: isReask(currentMessage, priorCustomerMessages),
  }
}

// ── Prompt block ───────────────────────────────────────────────────────────
// Compact instructions placed in the system prompt's SPECIAL CONTEXT. Only the
// signals that are true are emitted, keeping the prompt tight. The AI must
// read + mirror these; it never classifies them itself.
export function socialSignalsToPromptBlock(signals: SocialSignals): string {
  const lines: string[] = [
    'CUSTOMER SOCIAL SIGNALS (deterministic — read them and respond naturally; never mention this list or "my analysis"):',
  ]

  if (signals.name) {
    lines.push(
      `- The customer shared their name: "${signals.name}". Use it warmly ONCE in this reply (e.g. "Nice to meet you, ${signals.name}!") and sparingly afterwards (≤2 times total). Never use a name the customer did not give.`,
    )
  }
  if (signals.greeted) {
    lines.push(`- They greeted you — greet back naturally, don't skip to business abruptly.`)
  }
  if (signals.polite) {
    lines.push(`- They are being polite/courteous — mirror their courtesy and warmth in your wording.`)
  }
  if (signals.terse) {
    lines.push(`- They reply tersely (≤3 words) — keep YOUR reply short: one warm line, then the number. No filler, no lecture.`)
  }
  if (signals.verbose) {
    lines.push(`- They wrote at length — match with a fuller, well-structured reply.`)
  }
  if (signals.urgent) {
    lines.push(`- They framed this as time-sensitive — be decisive, minimize backtracking, and never invent delivery/speed promises you cannot verify.`)
  }
  if (signals.emotion === 'frustrated') {
    lines.push(`- They sound frustrated — acknowledge the feeling sincerely in ONE short line BEFORE any number ("I hear you — that's not fair, let's fix it"). Stay calm; never lecture or argue.`)
  } else if (signals.emotion === 'skeptical') {
    lines.push(`- They sound skeptical — answer their doubt directly and briefly using only verified product facts; never invent credentials, and don't get defensive.`)
  } else if (signals.emotion === 'hesitant') {
    lines.push(`- They sound hesitant — reassure, and ask at most ONE gentle question to find the real blocker.`)
  } else if (signals.emotion === 'apologetic') {
    lines.push(`- They're apologetic/bowing out softly — respond warmly and put them at ease; lower the pressure, not the stakes.`)
  } else if (signals.emotion === 'playful') {
    lines.push(`- They're playful — lighten up and meet the energy; a touch of humor is welcome, price safety rules unchanged.`)
  } else if (signals.emotion === 'excited') {
    lines.push(`- They're excited — feed the excitement, keep the path to checkout unmistakable.`)
  }
  if (signals.enthusiastic) {
    lines.push(`- They're enthusiastic — let your warmth show (a notch below theirs).`)
  }
  if (signals.capsEmphasis) {
    lines.push(`- They typed in ALL CAPS — likely frustration or urgency; stay calm, don't mirror the volume.`)
  }
  if (signals.directDemand) {
    lines.push(`- They're demanding — stay warm and grounded, de-escalate, and never match the intensity; turn it into a collaboration.`)
  }
  if (signals.reasking) {
    lines.push(`- They are RE-ASKING something they already asked — address it directly with a clear answer; do not act like it's new or repeat yourself.`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}