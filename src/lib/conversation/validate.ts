/**
 * Deterministic validation of generated customer-facing copy.
 *
 * The model is good at writing, bad at knowing what is true. Every rule that
 * protects the merchant (prices, discounts, links, urgency, claims) is
 * therefore checked here, in code, against the trusted facts — not left to the
 * prompt. A prompt says "don't lie"; this module proves it.
 *
 * A blocked message is never sent: the caller falls back to a safe,
 * fact-only template.
 */
import {
  ConversationFacts,
  allowedAmounts,
  allowedCodes,
  allowedHosts,
} from './facts'
import { BrandVoice, maxEmojis, maxWords } from './voice'

export type IssueCode =
  | 'empty'
  | 'too_long'
  | 'emoji_not_allowed'
  | 'too_many_emoji'
  | 'banned_phrase'
  | 'unverified_claim'
  | 'human_impersonation'
  | 'unknown_price'
  | 'unauthorized_discount'
  | 'unapproved_link'
  | 'formatting'
  | 'duplicate'

export type ValidationIssue = {
  code: IssueCode
  severity: 'block' | 'warn'
  detail: string
}

export type ValidationResult = {
  ok: boolean
  issues: ValidationIssue[]
  /** The message after safe, meaning-preserving repairs (emoji/whitespace). */
  text: string
}

// Surrogate-pair ranges instead of the `u` flag: the project compiles to ES5.
const EMOJI_RE = /[\u2190-\u21FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g

/**
 * Claims the copy may only make when the merchant has the data to back them.
 * Each entry names the verified flag that unlocks it.
 */
const CLAIM_RULES: Array<{ pattern: RegExp; requires: 'bestseller' | 'lowStock' | 'reviewCount' | 'never'; label: string }> = [
  // Popularity / social proof
  { pattern: /\bbest[\s-]?sell(er|ing)\b/i, requires: 'bestseller', label: 'bestseller claim' },
  { pattern: /\bour\s*#\s*1\b/i, requires: 'bestseller', label: 'bestseller claim' },
  { pattern: /\b(number one|most popular|customer favourite|customer favorite|fan favourite|fan favorite)\b/i, requires: 'bestseller', label: 'popularity claim' },
  { pattern: /\b(everyone|everybody|people are loving|people love|folks love|loved by (thousands|everyone|our customers))\b/i, requires: 'reviewCount', label: 'social proof claim' },
  { pattern: /\b(reviews? are (insane|amazing|incredible)|thousands of (customers|reviews)|rated [\d.]+ by)\b/i, requires: 'reviewCount', label: 'review claim' },
  // Scarcity / stock
  { pattern: /\b(sell(ing)? out|sells out|sold out|almost gone|almost sold out)\b/i, requires: 'lowStock', label: 'scarcity claim' },
  { pattern: /\b(stock is (running low|low|almost out)|limited stock|only \d+ left|last (one|two|pieces) left)\b/i, requires: 'lowStock', label: 'stock claim' },
  { pattern: /\b(stock (is )?moving fast|they'?re going fast|going fast|flipping fast|(go|goes|going) fast)\b/i, requires: 'lowStock', label: 'scarcity claim' },
  // Urgency tied to a real deadline we do not have
  { pattern: /\b(expires? (today|tonight|tomorrow)|ends? (today|tonight)|last chance|final reminder|today only|don'?t miss out before)\b/i, requires: 'never', label: 'unverified urgency claim' },
  // Guarantees / competitor pricing
  { pattern: /\b(guarantee[ds]?|money[\s-]?back|risk[\s-]?free|100% safe|lowest price|cheapest|best price (guarantee|in the market))\b/i, requires: 'never', label: 'guarantee/price claim' },
  { pattern: /\b(cheaper (elsewhere|online|at other stores?)|seen it cheaper|other stores? sell)\b/i, requires: 'never', label: 'competitor price claim' },
]

/** Statements that pretend a human did something no system did. */
const IMPERSONATION_PATTERNS: RegExp[] = [
  /\bi personally\b/i,
  /\bi (just )?(checked|looked|verified|confirmed)\b/i,
  /\bi spoke with\b/i,
  /\bmy (manager|colleague|team)\b/i,
  /\b(i'?m|i am) (a )?(real|human) (person|agent|employee)\b/i,
  /\b(i'?m|i am) (a )?real human\b/i,
  /\bnot a (bot|robot|ai|chatbot)\b/i,
  /\bi'?m not a (bot|robot|ai)\b/i,
  /\bwe'?ve (personally )?(handpicked|selected) (it|this) for you\b/i,
]

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi
const CODE_CLAIM_RE = /\bcode\s+([A-Za-z0-9][A-Za-z0-9_-]{2,24})\b/gi
const MONEY_RE = /(?:₹|\$|€|£|Rs\.?|INR|USD)\s?(\d[\d,]*(?:\.\d{1,2})?)/gi
const PERCENT_OFF_RE = /\b(\d{1,3})\s?%\s*(off|discount)\b/gi

function countEmoji(text: string): number {
  const matches = text.match(EMOJI_RE)
  return matches ? matches.length : 0
}

function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim()
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
}

function moneyAmounts(text: string): number[] {
  const out: number[] = []
  let match: RegExpExecArray | null
  MONEY_RE.lastIndex = 0
  while ((match = MONEY_RE.exec(text)) !== null) {
    const value = Number(match[1].replace(/,/g, ''))
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

function urls(text: string): string[] {
  return text.match(URL_RE) || []
}

function codes(text: string): string[] {
  const out: string[] = []
  let match: RegExpExecArray | null
  CODE_CLAIM_RE.lastIndex = 0
  while ((match = CODE_CLAIM_RE.exec(text)) !== null) {
    out.push(match[1])
  }
  return out
}

function percentOffs(text: string): number[] {
  const out: number[] = []
  let match: RegExpExecArray | null
  PERCENT_OFF_RE.lastIndex = 0
  while ((match = PERCENT_OFF_RE.exec(text)) !== null) {
    out.push(Number(match[1]))
  }
  return out
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Validate a generated message against the trusted facts and the merchant's
 * voice. `ok` is false when at least one blocking issue was found — the
 * message must then not be sent.
 */
export function validateMessage(
  text: string,
  facts: ConversationFacts,
  voice: BrandVoice,
  opts?: { previous?: string | null }
): ValidationResult {
  const issues: ValidationIssue[] = []
  const raw = typeof text === 'string' ? text : ''

  if (!raw.trim()) {
    return { ok: false, issues: [{ code: 'empty', severity: 'block', detail: 'message is empty' }], text: '' }
  }

  // Repairs that cannot change meaning are applied before the checks.
  let body = normalize(raw)
  const emojiCount = countEmoji(body)
  if (voice.emojiIntensity === 'off' && emojiCount > 0) {
    body = stripEmoji(body)
  }

  if (voice.emojiIntensity === 'off' && countEmoji(body) > 0) {
    issues.push({ code: 'emoji_not_allowed', severity: 'block', detail: 'voice forbids emoji' })
  }
  const allowedEmoji = maxEmojis(voice, facts.channel)
  const finalEmoji = countEmoji(body)
  if (finalEmoji > allowedEmoji) {
    issues.push({
      code: 'too_many_emoji',
      severity: 'block',
      detail: `${finalEmoji} emoji, voice allows ${allowedEmoji}`,
    })
  }

  const wordCount = words(body)
  const wordLimit = maxWords(voice, facts.channel)
  if (wordCount > wordLimit) {
    issues.push({
      code: 'too_long',
      severity: wordCount > wordLimit * 1.5 ? 'block' : 'warn',
      detail: `${wordCount} words, limit ${wordLimit}`,
    })
  }

  const lower = body.toLowerCase()
  for (const phrase of voice.bannedPhrases) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      issues.push({ code: 'banned_phrase', severity: 'block', detail: `merchant banned phrase: ${phrase}` })
    }
  }

  for (const rule of CLAIM_RULES) {
    if (!rule.pattern.test(body)) continue
    if (rule.requires === 'never') {
      issues.push({ code: 'unverified_claim', severity: 'block', detail: `unverified ${rule.label}` })
      continue
    }
    const verified = facts.verified
    const ok =
      (rule.requires === 'bestseller' && verified?.bestseller) ||
      (rule.requires === 'lowStock' && verified?.lowStock) ||
      (rule.requires === 'reviewCount' && typeof verified?.reviewCount === 'number' && verified.reviewCount > 0)
    if (!ok) {
      issues.push({ code: 'unverified_claim', severity: 'block', detail: `unverified ${rule.label}` })
    }
  }

  for (const pattern of IMPERSONATION_PATTERNS) {
    if (pattern.test(body)) {
      issues.push({ code: 'human_impersonation', severity: 'block', detail: 'claims to be a human or to have taken an action' })
      break
    }
  }

  const allowed = allowedAmounts(facts)
  for (const amount of moneyAmounts(body)) {
    const normalized = Math.round(amount * 100) / 100
    if (!allowed.some((a) => Math.abs(a - normalized) < 0.01)) {
      issues.push({ code: 'unknown_price', severity: 'block', detail: `price ${normalized} is not a known fact` })
    }
  }

  const allowedCodesList = allowedCodes(facts).map((c) => c.toLowerCase())
  for (const code of codes(body)) {
    if (!allowedCodesList.includes(code.toLowerCase())) {
      issues.push({ code: 'unauthorized_discount', severity: 'block', detail: `discount code ${code} is not authorised` })
    }
  }

  const discount = facts.discount
  for (const percent of percentOffs(body)) {
    const authorised =
      discount &&
      ((discount.type === 'percentage' && Math.abs(discount.value - percent) < 0.01) ||
        (discount.type === 'fixed' && discount.value === percent))
    if (!authorised) {
      issues.push({ code: 'unauthorized_discount', severity: 'block', detail: `${percent}% off is not authorised` })
    }
  }

  const hosts = allowedHosts(facts)
  for (const url of urls(body)) {
    let host = ''
    try {
      host = new URL(url).host.toLowerCase()
    } catch {
      issues.push({ code: 'unapproved_link', severity: 'block', detail: `unparsable link ${url}` })
      continue
    }
    if (!hosts.includes(host)) {
      issues.push({ code: 'unapproved_link', severity: 'block', detail: `link to ${host} is not allowed` })
    }
  }

  if (facts.channel === 'whatsapp' && /<[^>]+>|\*\*|__/.test(body)) {
    issues.push({ code: 'formatting', severity: 'block', detail: 'plain-text message contains markup' })
  }

  if (opts?.previous && isNearDuplicate(body, opts.previous)) {
    issues.push({ code: 'duplicate', severity: 'warn', detail: 'nearly identical to the previous message' })
  }

  const blocked = issues.some((i) => i.severity === 'block')
  return { ok: !blocked, issues, text: body }
}

/**
 * Two messages are near-duplicates when their word sets overlap almost
 * completely. Used to keep the recovery sequence from repeating itself.
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const tokens = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    )
  const setA = tokens(a)
  const setB = tokens(b)
  if (setA.size === 0 || setB.size === 0) return false
  let intersection = 0
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1
  })
  let union = setA.size
  setB.forEach((token) => {
    if (!setA.has(token)) union += 1
  })
  return union > 0 && intersection / union >= 0.8
}
