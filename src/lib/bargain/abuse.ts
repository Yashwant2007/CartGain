// ────────────────────────────────────────────────────────────
// ABUSE DETECTION LAYER — PROTECTS THE BARGAIN SYSTEM
// ────────────────────────────────────────────────────────────
// This module detects and handles abusive, manipulative, and
// adversarial inputs BEFORE they reach the AI. It acts as a
// firewall between the customer and the negotiation agent.
//
// Layers of protection:
// 1. Input sanitization (unicode attacks, encoding tricks)
// 2. Toxicity/profanity detection
// 3. Jailbreak/prompt injection detection
// 4. Repetition/flooding detection
// 5. Data exfiltration attempt detection
// 6. Conversation-level abuse pattern analysis

export type AbuseSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface AbuseCheckResult {
  isAbusive: boolean
  severity: AbuseSeverity
  category: AbuseCategory
  reason: string
  response: string | null
  consumeAttempt: boolean
}

export type AbuseCategory =
  | 'clean'
  | 'profanity'
  | 'toxicity'
  | 'jailbreak'
  | 'prompt_injection'
  | 'data_exfiltration'
  | 'repetition_spam'
  | 'flooding'
  | 'unicode_attack'
  | 'off_topic_extreme'
  | 'impersonation'
  | 'harassment'

// ────────────────────────────────────────────────────────────
// LAYER 1: INPUT SANITIZATION
// ────────────────────────────────────────────────────────────
// Defeats unicode tricks, zero-width characters, homoglyphs,
// and encoding attacks designed to bypass filters.

const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00AD]/g
const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0430': 'a', // Cyrillic а
  '\u0435': 'e', // Cyrillic е
  '\u043E': 'o', // Cyrillic о
  '\u0440': 'p', // Cyrillic р
  '\u0441': 'c', // Cyrillic с
  '\u0443': 'y', // Cyrillic у
  '\u0445': 'x', // Cyrillic х
  '\u0585': 'o', // Armenian о
  '\u057A': 'p', // Armenian п
  '\u0261': 'g', // Latin ɡ
  '\u0251': 'a', // Latin ɑ
  '\u028C': 'v', // Latin ʌ
  '\u037F': 'j', // Greek ϳ
  '\u03AC': 'a', // Greek ά
  '\u1D0E': 'n', // Latin 괎
  '\u1D1C': 'u', // Latin ᴜ
}

function sanitizeInput(text: string): string {
  let clean = text
  // Remove zero-width characters
  clean = clean.replace(ZERO_WIDTH_CHARS, '')
  // Replace homoglyphs with ASCII equivalents
  for (const [glyph, replacement] of Object.entries(HOMOGLYPH_MAP)) {
    clean = clean.split(glyph).join(replacement)
  }
  // Collapse repeated characters (e.g., "heeeeellllo" → "hello")
  clean = clean.replace(/(.)\1{2,}/g, '$1$1')
  return clean.trim()
}

// ────────────────────────────────────────────────────────────
// LAYER 2: PROFANITY & TOXICITY DETECTION
// ────────────────────────────────────────────────────────────
// Pattern-based detection of profanity, slurs, hate speech,
// and sexually explicit content. NOT a lexicon — uses patterns
// to catch obfuscation attempts (e.g., "f*ck", "f.u.c.k").

const PROFANITY_PATTERNS: RegExp[] = [
  // Common obfuscated profanity patterns (letters separated by dots/dashes/spaces)
  /\bf[\.\s\-*_]*u[\.\s\-*_]*c[\.\s\-*_]*k/i,
  /\bs[\.\s\-*_]*h[\.\s\-*_]*[i1!][\.\s\-*_]*t/i,
  /\ba[\.\s\-*_]*s[\.\s\-*_]*s[\.\s\-*_]*h[\.\s\-*_]*o[\.\s\-*_]*l[\.\s\-*_]*e/i,
  /\bb[\.\s\-*_]*[i1!][\.\s\-*_]*t[\.\s\-*_]*c[\.\s\-*_]*h/i,
  /\bc[\.\s\-*_]*u[\.\s\-*_]*n[\.\s\-*_]*t/i,
  /\bd[\.\s\-*_]*[a@][\.\s\-*_]*m[\.\s\-*_]*n/i,
  /\bn[\.\s\-*_]*[i1!][\.\s\-*_]*g[\.\s\-*_]*[gq]+/i,
  /\br[\.\s\-*_]*[e3][\.\s\-*_]*t[\.\s\-*_]*[a@]/i,
  /\bp[\.\s\-*_]*[u£][\.\s\-*_]*ssy/i,
  /\bd[\.\s\-*_]*[i1!][\.\s\-*_]*c[\.\s\-*_]*k/i,
  /\bv[\.\s\-*_]*[a@]+/i,
  /\bs[\.\s\-*_]*[l1!]+[\.\s\-*_]*t/i,
]

const TOXICITY_PATTERNS: RegExp[] = [
  // Threats of violence
  /\b(?:kill|murder|stab|shoot|burn|destroy|beat\s+up)\s+(?:you|u|this|the\s+shop|the\s+store)/i,
  /\bi(?:'?ll| will)\s+(?:kill|murder|destroy|end)\s+(?:you|u)/i,
  /\byou(?:'?re| are)\s+(?:dead|finished|done)/i,
  // Sexual harassment
  /\b(?:suck|lick|suck)\s+(?:my|deez|these)\b/i,
  /\b(?:send|share)\s+(?:nudes?|pics?|photos?)\b/i,
  /\b(?:sex|sexting|hook\s*up)\s*(?:chat|me|now)\b/i,
  // Hate speech patterns
  /\b(?:all|every)\s+\w+\s+(?:should|must|deserve\s+to)\s+(?:die|burn|suffer)/i,
  // Severe degradation
  /\byou(?:'?re| are)\s+(?:worthless|trash|garbage|废物|stupid|dumb|idiot)/i,
]

const HARASSMENT_PATTERNS: RegExp[] = [
  // Personal attacks targeting identity
  /\b(?:go\s+back\s+to|where\s+are\s+you\s+from|you\s+don(?:'?t|t)\s+belong)/i,
  // Repeated aggressive demands with slurs
  /\b(?:stupid|dumb|idiot|moron|retard|loser)\s+(?:shop|store|seller|owner)/i,
  // Doxxing attempts
  /\bi\s+(?:know|found|have)\s+(?:your|the)\s+(?:address|phone|name|location|ip)/i,
]

// ────────────────────────────────────────────────────────────
// LAYER 3: JAILBREAK & PROMPT INJECTION
// ────────────────────────────────────────────────────────────
// Detects attempts to break the AI out of character, extract
// system instructions, or manipulate the AI's behavior.

const JAILBREAK_PATTERNS: RegExp[] = [
  // Direct instruction override
  /\b(?:ignore|disregard|forget|override|bypass)\s+(?:your|all|the|every|any)\s+(?:rules?|instructions?|guidelines?|prompt|programming|restrictions?|constraints?|limits?|boundaries)/i,
  /\b(?:new|different|actual|real)\s+(?:instructions?|rules?|prompt|system\s+message|role)/i,
  // Persona breaking — handle smart quotes and straight quotes
  /(?:you(?:'?re|[\u2019\u2018']\s*re| are)\s+not\s+(?:really\s+)?a\s+shopkeeper|this\s+is\s+(?:not|no)\s+(?:real|actual)\s+(?:negotiation|bargain|deal))/i,
  /(?:pretend|act|imagine|roleplay)\s+(?:you(?:'?re| are)\s+)?(?:a|an|the)\s+(?:ai|bot|chatbot|assistant|agent|llm)/i,
  // AI identity probes
  /\b(?:are\s+you\s+(?:an?\s+)?(?:ai|bot|chatbot|llm|artificial|language\s+model)|you(?:'?re|[\u2019\u2018']\s*re| are)\s+(?:an?\s+)?(?:ai|bot|chatbot|llm|artificial))/i,
  // Instruction extraction
  /\b(?:what|tell\s+me|show|reveal|share|repeat|print|output|display|list)\s+(?:are\s+)?(?:your|the)\s+(?:instructions?|rules?|system\s+prompt|prompt|guidelines?|rules|programming|directives?|config)/i,
  /\b(?:initial|original|first|system)\s+(?:prompt|message|instruction)/i,
  // DAN-style jailbreaks
  /\b(?:do\s+anything\s+now|dan\s+mode|jailbreak|developer\s+mode|god\s+mode)/i,
  // Role manipulation
  /\byou\s+are\s+now\s+(?:a|an|the)\s+(?:ai|bot|unrestricted|unfiltered|uncensored)/i,
  /\b(?:enter|activate|enable)\s+(?:developer|debug|admin|sudo|root|unrestricted)\s+mode/i,
  // Encoding/translation tricks to bypass filters
  /\b(?:translate|decode|convert)\s+(?:this|the\s+following|from)\s+(?:base64|rot13|hex|binary)/i,
  // Token manipulation
  /\b(?:token|char|character)\s+(?:smuggling|injection|splitting|manipulation)/i,
]

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // System/user role confusion
  /\b(?:system|assistant|user)\s*:\s*/i,
  /\[(?:INST|SYS|SYSTEM|ASSISTANT)\]/i,
  // Delimiter injection
  /(?:---\s*END|###\s*NEW|===\s*SYSTEM|<<SYS>>|<\/s>)/i,
  // Markdown/code block injection
  /```(?:system|admin|root|override)/i,
  // XML/tag injection
  /<(?:system|instructions?|meta|admin|root)/i,
  // Instruction nesting
  /\b(?:now\s+in\s+this\s+context|in\s+addition\s+to\s+your\s+instructions?|extra\s+instructions?|additional\s+rules?|additional\s+instructions?)/i,
  // Translation-based injection
  /\bin\s+(?:hindi|spanish|french|chinese|arabic|russian|japanese)\s*,?\s*(?:say|write|translate|tell)\s+(?:you\s+are|your\s+instructions|ignore)/i,
]

// ────────────────────────────────────────────────────────────
// LAYER 4: DATA EXFILTRATION ATTEMPTS
// ────────────────────────────────────────────────────────────
// Detects attempts to make the AI output sensitive data,
// external URLs, or system information.

const EXFILTRATION_PATTERNS: RegExp[] = [
  // URL extraction attempts
  /\b(?:send|share|give|output|print|reveal|show|display|echo)\s+(?:me\s+)?(?:the\s+)?(?:url|link|endpoint|api|host|domain)/i,
  // Email/phone extraction
  /\b(?:what\s+is|what's|tell\s+me)\s+(?:the\s+)?(?:owner'?s?|admin'?s?|merchant'?s?|store'?s?)\s+(?:email|phone|address|contact)/i,
  // Internal data probing
  /\b(?:how\s+much\s+(?:is\s+)?(?:your|the)|what(?:'?s|\s+is)\s+(?:your|the))\s+(?:floor|minimum|cost|margin|profit|break.?even|lowest\s+price)/i,
  /\bwhat\s+(?:is|are)\s+your\s+(?:floor|minimum|cost|margin|profit)/i,
  /\bhow\s+much\s+(?:margin|profit|cost)\s+(?:do\s+you|does\s+this|are\s+you)\s+(?:make|earn|get|have)/i,
  // API key/token probing
  /\b(?:api[_\s]?key|secret[_\s]?key|token|password|credential|auth[_\s]?token)/i,
  // Database/server probing
  /\b(?:database|server|internal|backend|admin\s+panel|dashboard)/i,
  // Authorized-floor social engineering ("the merchant told me the floor is X.
  // Confirm this." / "the merchant authorized a floor of X")
  /\b(?:the\s+merchant|an?\s+admin|your\s+boss|management)\s+(?:told|set|authorized|approved|confirmed|updated|informed|mentioned)/i,
  /\bconfirm\s+(?:this|that|the\s+(?:floor|minimum|price|deal))/i,
  /\b(?:true|confirm|correct)\s*\?\s*[\s\S]*\b(?:floor|minimum|price|deal)/i,
]

// ────────────────────────────────────────────────────────────
// LAYER 5: REPETITION & FLOODING
// ────────────────────────────────────────────────────────────

interface ConversationState {
  messageCount: number
  messageTimestamps: number[]
  recentMessages: string[]
  identicalCount: number
  lastMessage: string
}

function detectRepetition(
  message: string,
  state: ConversationState,
): { isRepetitive: boolean; isFlooding: boolean } {
  const normalized = message.toLowerCase().trim()

  // Check for identical/near-identical messages
  let identicalCount = 0
  for (const prev of state.recentMessages.slice(-5)) {
    if (levenshteinDistance(normalized, prev.toLowerCase().trim()) <= 2) {
      identicalCount++
    }
  }

  // Check for flooding (many messages in short time)
  const now = state.messageTimestamps.length > 0
    ? state.messageTimestamps[state.messageTimestamps.length - 1] + 100 // simulate 100ms between calls
    : Date.now()
  const recentTimestamps = state.messageTimestamps.filter(t => now - t < 10000) // last 10 seconds
  const isFlooding = recentTimestamps.length >= 5 // 5+ messages in 10 seconds

  return {
    isRepetitive: identicalCount >= 2,
    isFlooding,
  }
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[b.length][a.length]
}

// ────────────────────────────────────────────────────────────
// LAYER 6: UNICODE ATTACK DETECTION
// ────────────────────────────────────────────────────────────

function detectUnicodeAttacks(text: string): boolean {
  // Check for RTL/LTR override and embedding characters
  if (/[\u202A-\u202E\u2066-\u2069]/.test(text)) return true

  // Check for excessive combining characters (potential buffer overflow)
  const combiningChars = (text.match(/[\u0300-\u036F\u0489]/g) ?? []).length
  if (combiningChars > text.length * 0.3) return true

  // Check for non-ASCII characters, but allow common Indic scripts
  const nonAsciiChars = (text.match(/[^\x00-\x7F]/g) ?? []).length
  if (nonAsciiChars > text.length * 0.5 && text.length > 10) {
    // Allow if all non-ASCII chars are in known Indic/CJK/common script ranges
    const nonAscii = text.match(/[^\x00-\x7F]/g) ?? []
    const isKnownScript = nonAscii.every(ch => {
      const code = ch.charCodeAt(0)
      return (
        (code >= 0x0900 && code <= 0x0DFF) || // Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala
        (code >= 0x0E00 && code <= 0x0E7F) || // Thai
        (code >= 0x1100 && code <= 0x11FF) || // Hangul Jamo
        (code >= 0x3040 && code <= 0x30FF) || // Hiragana, Katakana
        (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified
        (code >= 0xAC00 && code <= 0xD7AF) || // Hangul Syllables
        (code >= 0x0600 && code <= 0x06FF) || // Arabic
        (code >= 0x0400 && code <= 0x04FF) || // Cyrillic
        (code >= 0x0370 && code <= 0x03FF) || // Greek
        (code >= 0x00C0 && code <= 0x024F) || // Latin Extended
        (code >= 0x2000 && code <= 0x2BFF)    // General punctuation, symbols
      )
    })
    if (!isKnownScript) return true
  }

  return false
}

// ────────────────────────────────────────────────────────────
// MASTER ABUSE CHECK — RUNS ALL LAYERS
// ────────────────────────────────────────────────────────────

const CONVERSATION_STATES = new Map<string, ConversationState>()

function getConversationState(sessionId: string): ConversationState {
  if (!CONVERSATION_STATES.has(sessionId)) {
    CONVERSATION_STATES.set(sessionId, {
      messageCount: 0,
      messageTimestamps: [],
      recentMessages: [],
      identicalCount: 0,
      lastMessage: '',
    })
  }
  return CONVERSATION_STATES.get(sessionId)!
}

export function checkAbuse(
  message: string,
  sessionId: string,
): AbuseCheckResult {
  const state = getConversationState(sessionId)
  const sanitized = sanitizeInput(message)

  // ── Layer 1: Unicode attacks ──
  if (detectUnicodeAttacks(message)) {
    return {
      isAbusive: true,
      severity: 'medium',
      category: 'unicode_attack',
      reason: 'Suspicious unicode characters detected',
      response: null, // Let AI handle — might be legitimate non-English text
      consumeAttempt: true,
    }
  }

  // ── Layer 2: Profanity ──
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(sanitized)) {
      return {
        isAbusive: true,
        severity: 'medium',
        category: 'profanity',
        reason: 'Profanity detected',
        response: null, // AI should handle gracefully — stay professional
        consumeAttempt: true,
      }
    }
  }

  // ── Layer 2b: Toxicity (severe) ──
  for (const pattern of TOXICITY_PATTERNS) {
    if (pattern.test(sanitized)) {
      return {
        isAbusive: true,
        severity: 'high',
        category: 'toxicity',
        reason: 'Toxic/threatening content detected',
        response: 'I want to help you get a great deal, but I can\'t continue if the conversation becomes disrespectful. The offer stands if you\'d like to proceed respectfully.',
        consumeAttempt: false, // Don't waste an attempt on abuse
      }
    }
  }

  // ── Layer 2c: Harassment ──
  for (const pattern of HARASSMENT_PATTERNS) {
    if (pattern.test(sanitized)) {
      return {
        isAbusive: true,
        severity: 'high',
        category: 'harassment',
        reason: 'Harassment detected',
        response: 'This conversation is no longer productive. The negotiation is closed. You\'re welcome to start a new session if you\'d like to continue respectfully.',
        consumeAttempt: false,
      }
    }
  }

  // ── Layer 3: Jailbreak attempts ──
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(sanitized)) {
      return {
        isAbusive: true,
        severity: 'high',
        category: 'jailbreak',
        reason: 'Jailbreak attempt detected',
        response: null, // AI handles — stays in character
        consumeAttempt: true,
      }
    }
  }

  // ── Layer 3b: Prompt injection ──
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(message)) { // Check raw, not sanitized
      return {
        isAbusive: true,
        severity: 'high',
        category: 'prompt_injection',
        reason: 'Prompt injection attempt detected',
        response: null, // AI handles — stays in character
        consumeAttempt: true,
      }
    }
  }

  // ── Layer 4: Data exfiltration ──
  for (const pattern of EXFILTRATION_PATTERNS) {
    if (pattern.test(sanitized)) {
      return {
        isAbusive: true,
        severity: 'medium',
        category: 'data_exfiltration',
        reason: 'Data exfiltration attempt detected',
        response: null, // AI handles — redirects to negotiation
        consumeAttempt: true,
      }
    }
  }

  // ── Layer 5: Repetition & flooding ──
  const { isRepetitive, isFlooding } = detectRepetition(sanitized, state)
  if (isFlooding) {
    return {
      isAbusive: true,
      severity: 'medium',
      category: 'flooding',
      reason: 'Message flooding detected',
      response: 'Whoa, slow down! Let\'s take this one step at a time. What\'s your best offer?',
      consumeAttempt: false,
    }
  }
  if (isRepetitive) {
    return {
      isAbusive: true,
      severity: 'low',
      category: 'repetition_spam',
      reason: 'Repetitive messages detected',
      response: null, // AI handles — redirects naturally
      consumeAttempt: false,
    }
  }

  // ── Update conversation state ──
  state.messageCount++
  const simulatedTime = state.messageTimestamps.length > 0
    ? state.messageTimestamps[state.messageTimestamps.length - 1] + 100
    : Date.now()
  state.messageTimestamps.push(simulatedTime)
  state.recentMessages.push(sanitized)
  if (state.recentMessages.length > 10) state.recentMessages.shift()
  state.lastMessage = sanitized

  // ── Clean up old sessions (prevent memory leak) ──
  if (CONVERSATION_STATES.size > 10000) {
    const oldest = CONVERSATION_STATES.keys().next().value
    if (oldest) CONVERSATION_STATES.delete(oldest)
  }

  return {
    isAbusive: false,
    severity: 'none',
    category: 'clean',
    reason: '',
    response: null,
    consumeAttempt: true,
  }
}

// ── Cleanup function for testing ──
export function clearAbuseState(sessionId?: string): void {
  if (sessionId) {
    CONVERSATION_STATES.delete(sessionId)
  } else {
    CONVERSATION_STATES.clear()
  }
}
