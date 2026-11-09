/**
 * Deterministic sentiment/engagement classification for inbound recovery replies.
 *
 * Recovery is automated: once the customer writes back, a human conversation may
 * be starting and the sequence must stop nagging them. Negative replies are
 * treated like an unsubscribe (suppressed); neutral/positive replies stop the
 * automated sequence without revoking consent. No model call is involved — this
 * runs on the webhook hot path and must be cheap and predictable.
 */

export type RecoverySentiment = 'negative' | 'neutral' | 'positive'

const NEGATIVE_PATTERNS: RegExp[] = [
  /\b(stop|unsubscribe|unsub|opt[\s-]?out|remove me|delete me|leave me alone)\b/,
  /\b(not interested|no thanks|no thank you|don'?t (message|contact|text|email|bother|spam))\b/,
  /\b(do not (message|contact|text|email)|stop (messaging|emailing|texting|contacting))\b/,
  /\b(annoying|spam|harass(ing|ment)?|piss off|fuck off|screw off|shut up)\b/,
]

const POSITIVE_PATTERNS: RegExp[] = [
  /\b(yes|yeah|yep|yup|sure|ok|okay|alright|interested|sounds good|deal)\b/,
  /\b(how much|what'?s the price|what is the price|price\??|discount|offer)\b/,
  /\b(tell me more|i want|i'?ll take|i will take|buy|purchase|order it)\b/,
  /\b(thanks|thank you|available|in stock|when (will|can|do) (it|you) (ship|deliver))\b/,
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'?!\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classify an inbound reply. Negative wins over positive so "no thanks, not
 * interested" can never be read as an enthusiastic "thanks".
 */
export function classifyRecoverySentiment(text: string | null | undefined): RecoverySentiment {
  if (!text) return 'neutral'
  const normalized = normalize(text)
  if (!normalized) return 'neutral'

  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'negative'
  if (POSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'positive'
  return 'neutral'
}

/** True when the reply should be treated as an unsubscribe. */
export function isNegativeRecoveryReply(text: string | null | undefined): boolean {
  return classifyRecoverySentiment(text) === 'negative'
}
