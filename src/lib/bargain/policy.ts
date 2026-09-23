// Deterministic merchant-policy guards for the bargain engine.
//
// These are pure, cheap classifiers the BACKEND enforces on top of the LLM
// (spec §24 coupon stacking, §25 campaign lifecycle, §27 bundle handling).
// The AI is never trusted to make these decisions: if a classifier fires, the
// server converts a would-be accept into a bounded, reason-coded response.

export interface CampaignWindow {
  campaignStart?: Date | string | null
  campaignEnd?: Date | string | null
}

export type CampaignStatus = 'active' | 'inactive'

// A campaign is only "active" while inside a fully-configured window. The
// config route already refuses half-configured or inverted windows (spec
// §9/§28), so only three cases are reachable:
//   - no window at all         → always active (bargaining is the campaign)
//   - window configured        → active only within [start, end)
//   - window entirely in past  → inactive (offer must not be accepted)
export function bargainCampaignStatus(
  config: CampaignWindow | null | undefined,
  now: Date = new Date(),
): CampaignStatus {
  if (!config || config.campaignStart == null || config.campaignEnd == null) {
    return 'active'
  }
  const start = config.campaignStart instanceof Date ? config.campaignStart : new Date(config.campaignStart)
  const end = config.campaignEnd instanceof Date ? config.campaignEnd : new Date(config.campaignEnd)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'active'
  return now >= start && now < end ? 'active' : 'inactive'
}

// Matches the customer explicitly invoking another discount channel
// (promo code / coupon / voucher). Words alone are treated as a mention even
// without a code token — the fraction of false positives is far lower than the
// revenue leakage of letting a bargain code stack silently.
const COUPON_WORDS =
  /\b(?:coupon|vouchers?|promo\s*code|promo\b|discount\s*code|referral\s*code|gift\s*card|code\s*:\s*[A-Z0-9\-_ ]{3,}|apply.{0,6}(?:code|coupon|voucher))\b/i

// "code/coupon/voucher/promo" followed closely by a code-like token. The token
// must contain a digit OR be an ALL-CAPS word — plain lowercase prose ("code red
// alert") never looks like a coupon — so real codes fire and chatter does not.
export function detectCouponMention(text: string): boolean {
  if (!text || text.trim().length === 0) return false
  if (COUPON_WORDS.test(text)) return true
  const m = text.match(/\b(?:code|coupon|voucher|promo)\b[\s:]*([^\s,.;!]+)/i)
  if (!m) return false
  const token = m[1]
  return /[0-9]/.test(token) || /^[A-Z]{3,}$/.test(token)
}

// Scans the customer transcript (most recent first) for a coupon mention.
// Used at accept time to enforce the no-stacking policy on the whole thread,
// so a coupon mentioned one message earlier still blocks the accept.
export function couponMentionedInMessages(
  messages: Array<{ content?: string | null }>,
): boolean {
  for (const m of messages) {
    if (m?.content && detectCouponMention(m.content)) return true
  }
  return false
}

// Detects a request to buy DISTINCT products together ("serum and moisturizer",
// "bundle", "combo deal", "both"). Deliberately does NOT fire for same-product
// bulk ("2 bottles of serum", "serum ×3") — that path already has deterministic
// quantity handling (§bulk). Because the negotiation model is single-product,
// a multi-product request must never let the LLM invent a combined price.
const MULTI_PRODUCT_PATTERNS = [
  /\b(?:bundle|bundle\s*(?:deal|offer|price)?|combo(?:s)?\s*(?:deal|offer|price)?|package(?:\s*deal)?|value\s*set|combo\s*offer)\b/i,
  /\b(?:both|the\s+two|these\s+two|both\s+of\s+(?:them|these|those)|all\s+three|these\s+three)\b/i,
  /\b(?:plus)\b.{0,20}\b(?:the\s+)?\w+\b/i, // "serum plus moisturizer" (serum → "and" style handled by AND rule)
  /\b(?:and|&)\b.{0,20}\b(?:also|another|other)\b/i,
  /\b(?:give|get|take|add|buy|price|deal|offer)\b.{0,6}\b(?:both|bundle|combo|together)\b/i,
  /\b(?:together|as\s+a\s+set|as\s+a\s+package)\b/i,
] as const

export function detectMultiProductRequest(text: string): boolean {
  if (!text || text.trim().length === 0) return false
  // A quantity-first mention ("2 serum", "3 of these") is bulk, not a bundle —
  // strip leading numeric quantity tokens so the classifier can't misfire.
  const stripped = text
    .replace(/\b\d+(?:\s*[×x]|\s*(?:of|nos?|units?|pcs?|pack))?\s+(?:of\s+the\s+|the\s+)?/i, '')
  return MULTI_PRODUCT_PATTERNS.some((re) => re.test(stripped))
}