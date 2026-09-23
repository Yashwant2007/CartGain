// AI Salesperson — deterministic shopper intent & objection classification.
//
// A lightweight, deterministic classifier that labels the shopper's message so
// the system prompt (and, later, the recommended-item layer) can react with
// product-aware strategy instead of guessing. It deliberately runs BEFORE the
// LLM: intent is a decision the merchant controls, not one we outsource.

export type ShopperIntent =
  | 'UNKNOWN'
  | 'PRICE_ONLY'
  | 'VALUE_UNCLEAR'
  | 'BUDGET_CONSTRAINT'
  | 'PRODUCT_MISMATCH'
  | 'COMPARISON'
  | 'PRODUCT_QUESTION'
  | 'PURCHASE_READY'
  | 'WALKOUT'
  | 'GENERIC_CHAT'
  | 'RECOMMENDATION_REQUEST'
  | 'PRODUCT_DISCOVERY'

export type ShopperObjection =
  | null
  | 'PRICE'
  | 'FIT_VARIANT'
  | 'AVAILABILITY'
  | 'TRUST'
  | 'SHIPPING_DELAY'
  | 'PAYMENT_FRICTION'
  | 'VALUE'

/** How the shopper framed the number they shared. */
export type BudgetType = 'maximum' | 'approximate' | 'minimum' | null

export interface IntentAnalysis {
  intent: ShopperIntent
  objection: ShopperObjection
  signals: string[]
  offersPriceSignal: boolean
  /** Parsed budget amount in the shopper's currency (symbol stripped). */
  budget: number | null
  /** How the shopper framed the amount. */
  budgetType: BudgetType
  /** Rough product topic the shopper is after (e.g. "for oily skin"), if detectable. */
  need: string | null
}

const RE = {
  price: /\b(best\s+price|lower|discount|price|cheap|cheaper|off|deal|budget|only\s+(have|spend|can\s+spend|got|burn)|can\s+you\s+do|what('| is|s)*\s*(the\s+)?(lowest|minimum|best))/i,
  budget: /\b(budget|only\s+(have|spend|can\s+spend|got)\s+)|tight\s+budget|don'?t\s+have\s+much|all\s+i\s+can\s+afford|max\s+[₹$€£]?\s*\d+/i,
  comparison: /\b(elsewhere|other\s+(store|shop|site)|amazon|flipkart|myntra|meesho|walmart|competing|rival|compare(ing)?\s+price|got\s+it\s+for|saw\s+it\s+for|cheaper\s+somewhere)/i,
  productQuestion: /\b(material|made\s+of|ingredient|composition|sizes?|colour|color|warrant(y|ies)|guarantee|feature(s)?|specs?\b|specification|compatible|certif|measurement|dimensions?|weight|battery|usb|cotton|leather|capacity|speed|does\s+it\s+have|do\s+you\s+have|how\s+many|comes\s+with|included)/i,
  value: /\b(worth|value|good\s+product|is\s+this\s+(good|worth)|how\s+is\s+the\s+(quality|build)|better\s+than|what('s| is| do)\s+(i\s+)?get)/i,
  purchaseReady: /\b(i'?ll\s+(take|buy|get|lock)|take\s+it\b|deal\s+done|checkout|order\s+it|buying\s+it|ready\s+to\s+order|let'?s\s+(do\s+it|lock|wrap\s+it|close)|lock\s+(it|this|the\s+deal)|finaliz(e|ing)|accept\s+the\s+(price|deal))/i,
  mismatch: /\b(not\s+my\s+size|different\s+(size|colour|color|variant)|need(ed|s)?\s+it\s+in|available\s+in\s+my|wrong\s+(size|variant)|only\s+(left|have)\s+in)/i,
  trust: /\b(original|genuine|authentic|real|fake|duplicate|trust\b|reviews?|rating|scam|legit|certified)/i,
  shipping: /\b(shipping|deliver(y)?|delivery|arrive|reache?s?\s+me|tomorrow|urgent|today|expe?dited|by\s+(monday|friday|the\s+weekend))/i,
  payment: /\b(cash|upi|gpay|phonepe|paytm|cod|emi|net\s+banking|crdit|card\s+payment|payment\s+option)/i,
  walkout: /\b(bye|goodbye|leaving|walk\s+away|finding\s+elsewhere|go(s)?\s+elsewhere|not\s+interested|never\s+mind|forget\s+it|skip\s+it|moving\s+on|i'?ll\s+pass)/i,
  money: /[₹$€£]\s*\d+|\d+\s*(rup(ee|ees)|bucks|rs)/i,
  recommendationRequest: /\b(recommend|suggest(ion)?s?|anything\s+(else|similar|better)|something\s+(else|similar|cheaper)|show\s+(me\s+)?(more|other|alternat)|what\s+(else|other|alternat|more)\s|other\s+(options?|products?|alternatives?)|alternatives?|second\s+options?|any\s+other|koi\s+aur|kuch\s+aur|aur\s+(bhi|koi|kuch)|chahiye)\b/i,
  discovery: /\b(looking\s+for|searching\s+for|need\s+something|want\s+something|find\s+(me\s+)?a\s|help\s+me\s+find|explore\s+|browse\b|see\s+what\s+(you\s+|else\s+)?(have|exist)|do\s+you\s+have|show(?: me)?\s+your|kya\s+(hai|options?|recommend|suggest)|dikha(?:o|ye)|options?\s+dikhao)\b/i,
}

const STOPWORDS_NEED = new Set(['this', 'that', 'it', 'the', 'a', 'an', 'me', 'you', 'my', 'for', 'of', 'in', 'within', 'with', 'like', 'some', 'something', 'looking', 'want', 'wanted', 'need', 'needed', 'instead', 'near', 'under', 'price', 'budget', 'amount', 'money', 'option', 'options', 'alternative', 'alternatives', 'product', 'products', 'cheaper', 'sasta', 'discount', 'better'])

const NUM_PATTERN = String.raw`\d{1,3}(?:,\d{3})+|\d{2,8}(?:,\d{3})*`

// A budget amount is "maximum" when the shopper caps it, "approximate" when it
// is loose, and "minimum" when they floor it.
const BUDGET_MAX_RE = new RegExp(String.raw`\b(?:max|maximum|upto|up\s+to|at\s+most|under|below|within|less\s+than|only\s+(?:have|spend|can\s+spend|got|burn)|can\s+spend|can\s+afford|se\s+kam|ke\s+andar|iske\s+andar|andar\s+tak|tak\s+to|budget(?:\s+of)?|around|about|approx|approximately|roughly|~)\b[^\d\n]{0,16}[₹$€£]?\s*(${NUM_PATTERN})`, 'gi')
const BUDGET_MIN_RE = new RegExp(String.raw`\b(?:at\s+least|minimum|min|se\s+zyada|se\s+upar)\b[^\d\n]{0,16}[₹$€£]?\s*(${NUM_PATTERN})`, 'gi')
const BUDGET_PREFIX_RE = new RegExp(String.raw`[₹$€£]\s*(${NUM_PATTERN})\s*(?:only|max|maximum|budget|tak|andar|se\s+kam|is\s+all\s+i\s+can\s+spend|is\s+my\s+limit|ho\s+to|chahiye)`, 'gi')
const MONEY_ANY_RE = new RegExp(String.raw`[₹$€£]?\s*(${NUM_PATTERN})`, 'g')

const NUM_CLEAN = (s: string): number => Number(s.replace(/[^\d]/g, '')) || 0

/** Deterministically parse the shopper's budget from their message. */
export function extractBudget(message: string): { amount: number; type: NonNullable<BudgetType> } | null {
  const text = ` ${message.trim()} `
  const firstNum = (re: RegExp): number | null => {
    re.lastIndex = 0
    const m = re.exec(text)
    return m ? NUM_CLEAN(m[1]) : null
  }
  const maxHit = firstNum(BUDGET_MAX_RE)
  if (maxHit) return { amount: maxHit, type: 'maximum' }
  const minHit = firstNum(BUDGET_MIN_RE)
  if (minHit) return { amount: minHit, type: 'minimum' }
  const prefixHit = firstNum(BUDGET_PREFIX_RE)
  if (prefixHit) return { amount: prefixHit, type: 'maximum' }
  // Fallback: a bare currency amount with a "budget" mention nearby.
  if (/\bbudget\b|tight\s+budget|don'?t\s+have\s+much|all\s+i\s+can\s+(afford|spend)/i.test(text)) {
    const anyHit = firstNum(MONEY_ANY_RE)
    if (anyHit) return { amount: anyHit, type: 'approximate' }
  }
  return null
}

const NEED_PATTERN = /\b(?:instead\s+of|in\s+place\s+of|koi\s+aur|any\s+other|something\s+(?:like|in|for|within)|looking\s+for|need(?:ed)?\s+(?:something|a|an)|want(?:ed)?\s+(?:something|a|an)|for\s+(?:my|the|that)|suits?\s+my|under\s+(?:my|the)\s+range)\s+([a-z][a-z0-9'\- ]{1,28})/i

/** Deterministically pull a short product topic from the message, if any. */
export function extractNeed(message: string): string | null {
  const text = ` ${message.trim().toLowerCase()} `
  const m = NEED_PATTERN.exec(text)
  if (!m) return null
  const words = m[1]
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS_NEED.has(w))
    .slice(0, 3)
  return words.length > 0 ? words.join(' ') : null
}

export function analyzeIntent(message: string): IntentAnalysis {
  const text = ` ${message.trim().toLowerCase()} `
  const signals: string[] = []
  const hits = (key: keyof typeof RE, label: string): boolean => {
    const matched = RE[key].test(text)
    if (matched) signals.push(label)
    return matched
  }

  const isMoney = hits('money', 'money_amount')
  const isWalkout = hits('walkout', 'walkout')
  const priceIntent = hits('price', 'price_signal')
  const budgetIntent = hits('budget', 'budget_signal')
  const comparisonIntent = hits('comparison', 'comparison_signal')
  const productQ = hits('productQuestion', 'product_question')
  const valueIntent = hits('value', 'value_signal')
  const purchaseIntent = hits('purchaseReady', 'purchase_signal')
  const mismatch = hits('mismatch', 'variant_mismatch')
  const trust = hits('trust', 'trust_signal')
  const shipping = hits('shipping', 'shipping_signal')
  const payment = hits('payment', 'payment_signal')
  const recRequest = hits('recommendationRequest', 'recommendation_request')
  const discovery = hits('discovery', 'discovery_signal')

  const budget = extractBudget(message)
  const need = extractNeed(message)

  let intent: ShopperIntent = 'UNKNOWN'
  if (isWalkout) intent = 'WALKOUT'
  else if (purchaseIntent && !comparisonIntent) intent = 'PURCHASE_READY'
  else if (mismatch) intent = 'PRODUCT_MISMATCH'
  else if (productQ || trust) intent = 'PRODUCT_QUESTION'
  else if (comparisonIntent) intent = 'COMPARISON'
  else if (recRequest) intent = 'RECOMMENDATION_REQUEST'
  else if (discovery) intent = 'PRODUCT_DISCOVERY'
  else if (budgetIntent || budget) intent = 'BUDGET_CONSTRAINT'
  else if (priceIntent || isMoney) intent = 'PRICE_ONLY'
  else if (valueIntent) intent = 'VALUE_UNCLEAR'
  else if (message.trim().length > 0) intent = 'GENERIC_CHAT'

  let objection: ShopperObjection = null
  if (budgetIntent || priceIntent || isMoney) objection = 'PRICE'
  else if (mismatch) objection = 'FIT_VARIANT'
  else if (trust) objection = 'TRUST'
  else if (shipping) objection = 'SHIPPING_DELAY'
  else if (payment) objection = 'PAYMENT_FRICTION'
  else if (valueIntent) objection = 'VALUE'

  return {
    intent,
    objection,
    signals,
    offersPriceSignal: isMoney,
    budget: budget?.amount ?? null,
    budgetType: budget?.type ?? null,
    need,
  }
}

const INTENT_LABEL: Record<ShopperIntent, string> = {
  UNKNOWN: 'not clearly expressed',
  PRICE_ONLY: 'primarily price-driven',
  VALUE_UNCLEAR: 'unsure the product is worth the price — needs value framing',
  BUDGET_CONSTRAINT: 'working within a specific budget',
  PRODUCT_MISMATCH: 'checking whether the product fits a specific need/variant',
  COMPARISON: 'comparing price elsewhere',
  PRODUCT_QUESTION: 'asking a product-information question before deciding',
  PURCHASE_READY: 'ready to buy, price is the last step',
  WALKOUT: 'threatening to leave the negotiation',
  GENERIC_CHAT: 'casual conversation',
  RECOMMENDATION_REQUEST: 'asking for other product options from this store',
  PRODUCT_DISCOVERY: 'browsing — wants the store to surface matching products',
}

const OBJECTION_LABEL: Record<NonNullable<ShopperObjection>, string> = {
  PRICE: 'price objection — respond with value framing and a concrete counter',
  FIT_VARIANT: 'variant/size mismatch — steer to the matching option if verified, otherwise honestly say you cannot confirm availability',
  AVAILABILITY: 'availability concern — only state verified stock; never fabricate',
  TRUST: 'trust/authenticity concern — use only merchant-approved selling points; never invent credentials',
  SHIPPING_DELAY: 'shipping/timeline concern — do not promise delivery times you cannot verify',
  PAYMENT_FRICTION: 'payment-method concern — reassure with the store\'s real options if known, otherwise offer checkout details',
  VALUE: 'value uncertainty — break what the price includes',
}

// Compact prompt block placed in the SHOPPER INTENT section.
export function shopperIntentToPromptBlock(analysis: IntentAnalysis): string {
  const lines = [
    `SHOPPER INTENT (deterministic classification of the current message — reason about it, but never say "my model says"):`,
    `- Intent: ${INTENT_LABEL[analysis.intent]}`,
  ]
  if (analysis.objection) {
    lines.push(`- Objection detected: ${OBJECTION_LABEL[analysis.objection]}`)
  }
  if (analysis.intent === 'PRODUCT_QUESTION') {
    lines.push(`- If the question is about a feature not in PRODUCT CONTEXT, admit you don't have verified details and point to the product page.`)
  }
  if (analysis.intent === 'RECOMMENDATION_REQUEST' || analysis.intent === 'PRODUCT_DISCOVERY') {
    lines.push(
      `- If the shopper is asking for alternatives from this store: it is HELPFUL to offer alternatives, but NEVER invent product names, prices, or availability. Only mention products the merchant has actually set up (see RECOMMENDATIONS guidance elsewhere in this prompt).`,
    )
  }
  if (analysis.budget != null) {
    lines.push(
      `- Detected budget: ${analysis.budget}${analysis.budgetType ? ` (${analysis.budgetType})` : ''}. Treat this as the ceiling the shopper shared; do not argue with their number.`,
    )
  }
  if (analysis.need) {
    lines.push(`- Shopper's stated need: "${analysis.need}". Use it to steer product suggestions.`)
  }
  return lines.join('\n')
}

export function intentShortLabel(analysis: IntentAnalysis): string {
  return analysis.objection ? `${analysis.intent}:${analysis.objection}` : analysis.intent
}