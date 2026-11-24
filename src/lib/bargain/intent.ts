// AI Salesperson — deterministic shopper intent & objection classification.
//
// A lightweight, deterministic classifier that labels the shopper's message so
// the system prompt (and, later, the recommended-item layer) can react with
// product-aware strategy instead of guessing. It deliberately runs BEFORE the
// LLM: intent is a decision the merchant controls, not one we outsource.

import { parseStructuredOffer, type OfferBasis } from './offer-structure'
import { classifyNonOfferNumber, extractPrice, normalizeCustomerText, type NonOfferNumberContext } from './text'

export type ShopperIntent =
  | 'UNKNOWN'
  | 'PRICE_ONLY'
  | 'VALUE_UNCLEAR'
  | 'BUDGET_CONSTRAINT'
  | 'PRODUCT_MISMATCH'
  | 'COMPARISON'
  | 'PRODUCT_QUESTION'
  | 'PURCHASE_READY'
  | 'PURCHASE_HESITATION'
  | 'WALKOUT'
  | 'GENERIC_CHAT'
  | 'RECOMMENDATION_REQUEST'
  | 'PRODUCT_DISCOVERY'

export type ShopperObjection =
  | null
  | 'PRICE'
  | 'SHIPPING'
  | 'SHIPPING_DELAY'
  | 'QUALITY'
  | 'TRUST'
  | 'BUDGET'
  | 'PRODUCT_INFORMATION'
  | 'COMPARISON'
  | 'FIT_VARIANT'
  | 'AVAILABILITY'
  | 'PURCHASE_HESITATION'
  | 'PAYMENT_FRICTION'
  | 'VALUE'

/**
 * The nine top-level objection categories the Master Upgrade Phase 1 asks for.
 * `ShopperObjection` is the finer-grained internal label; this maps it onto the
 * published taxonomy used for reporting and intent→action routing.
 */
export type ObjectionCategory =
  | 'PRICE_OBJECTION'
  | 'SHIPPING_OBJECTION'
  | 'QUALITY_OBJECTION'
  | 'TRUST_OBJECTION'
  | 'BUDGET_OBJECTION'
  | 'PRODUCT_INFORMATION'
  | 'COMPARISON_OBJECTION'
  | 'PURCHASE_HESITATION'
  | 'OTHER_OR_UNKNOWN'

/** How the shopper framed the number they shared. */
export type BudgetType = 'maximum' | 'approximate' | 'minimum' | null

export type ShopperIntentCategoryCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K'

export const SHOPPER_INTENT_CATEGORIES = {
  A: { code: 'A', name: 'DISCOUNT_REQUEST', intent: 'PRICE_ONLY' },
  B: { code: 'B', name: 'BUDGET_CONSTRAINT', intent: 'BUDGET_CONSTRAINT' },
  C: { code: 'C', name: 'QUALITY_CONCERN', intent: 'PRODUCT_QUESTION' },
  D: { code: 'D', name: 'PRODUCT_INFORMATION', intent: 'PRODUCT_QUESTION' },
  E: { code: 'E', name: 'TRUST_CONCERN', intent: 'PRODUCT_QUESTION' },
  F: { code: 'F', name: 'COMPARISON', intent: 'COMPARISON' },
  G: { code: 'G', name: 'FIT_OR_AVAILABILITY', intent: 'PRODUCT_MISMATCH' },
  H: { code: 'H', name: 'PURCHASE_READY', intent: 'PURCHASE_READY' },
  I: { code: 'I', name: 'HESITATION_WALKOUT_OR_UNKNOWN', intent: 'UNKNOWN' },
  J: { code: 'J', name: 'ALTERNATIVES_REQUEST', intent: 'RECOMMENDATION_REQUEST' },
  K: { code: 'K', name: 'COMPLEMENT_REQUEST', intent: 'PRODUCT_DISCOVERY' },
} as const

export type ShopperIntentCategoryName = (typeof SHOPPER_INTENT_CATEGORIES)[ShopperIntentCategoryCode]['name']

export interface ShopperIntentCategory {
  code: ShopperIntentCategoryCode
  name: ShopperIntentCategoryName
  intent: ShopperIntent
}

export interface IntentAnalysis {
  intent: ShopperIntent
  objection: ShopperObjection
  signals: string[]
  offersPriceSignal: boolean
  /** Parsed budget amount in the shopper's currency (symbol stripped). */
  budget: number | null
  /** How the shopper framed the amount. */
  budgetType: BudgetType
  /** True when the shopper is objecting to the price (not proposing to pay it). */
  priceComplaint: boolean
  offerBasis: OfferBasis
  offerQuantity: number
  offerClarificationNeeded: boolean
  nonOfferNumberContext: NonOfferNumberContext
  asksBestPrice: boolean
  /** Rough product topic the shopper is after (e.g. "for oily skin"), if detectable. */
  need: string | null
  /** Published nine-category objection taxonomy (Phase 1 intent→action routing). */
  category: ObjectionCategory
  shopperCategory: ShopperIntentCategoryCode
  shopperCategoryName: ShopperIntentCategoryName
}

const RE = {
  bestPriceAsk: /\b(how\s+(?:much\s+)?low\s+can\s+you\s+go|how\s+much\s+can\s+you\s+(?:go|come\s+down)|how\s+low\s+(?:will|would)\s+you\s+go|how\s+far\s+(?:can|will|would)\s+you\s+(?:go|come\s+down)|lowest\s+(?:price|you\s+can|you\s+will|you\s+would)|best\s+price|best\s+you\s+can\s+do|what(?:'s|\s+is|\s+s)?\s+(?:the\s+)?(?:lowest|minimum|best)\s+(?:price|you\s+can\s+do|you\s+will\s+do)|your\s+best\s+(?:price|offer)|final\s+price|last\s+price|can\s+you\s+go\s+lower)\b/i,
  price: /\b(best\s+price|lower|discount|price|cheap|cheaper|off|deal|budget|only\s+(have|spend|can\s+spend|got|burn)|can\s+you\s+do|what('| is|s)*\s*(the\s+)?(lowest|minimum|best))/i,
  budget: /\b(budget|only\s+(have|spend|can\s+spend|got)\s+)|tight\s+budget|don'?t\s+have\s+much|all\s+i\s+can\s+afford|max\s+[₹$€£]?\s*\d+/i,
  comparison: /\b(elsewhere|other\s+(brand|company|maker|store|shop|site|seller)|another\s+(brand|company|maker|store|shop|site|seller)|amazon|flipkart|myntra|meesho|walmart|competing|rival|compare(ing)?\s+price|got\s+it\s+for|saw\s+it\s+for|cheaper\s+somewhere)/i,
  productQuestion: /\b(material|made\s+of|ingredient|composition|sizes?|colour|color|warrant(y|ies)|guarantee|feature(s)?|specs?\b|specification|compatible|certif|measurement|dimensions?|weight|battery|usb|cotton|leather|capacity|speed|does\s+it\s+have|do\s+you\s+have|how\s+many|comes\s+with|included)/i,
  value: /\b(worth|value|good\s+product|is\s+this\s+(good|worth)|how\s+is\s+the\s+(quality|build)|better\s+than|what('s| is| do)\s+(i\s+)?get)/i,
  // Objection language: the shopper is criticising the price, not bidding on it.
  // Used to make sure a figure mentioned in a complaint is never read as an offer.
  complaint: /\b(too\s+(?:much|high|expensive|pricey|steep|costly)|expensive|pricey|costly|overpriced|steep|a\s+lot(?:\s+of\s+(?:money|cash))?|out\s+of\s+(?:my\s+)?(?:budget|range)|above\s+my\s+budget|beyond\s+my\s+budget|not\s+worth|unaffordable|can'?t\s+afford)\b/i,
  purchaseReady: /\b(i'?ll\s+(take|buy|get|lock)|take\s+it\b|deal\s+done|checkout|order\s+it|buying\s+it|ready\s+to\s+order|let'?s\s+(do\s+it|lock|wrap\s+it|close)|lock\s+(it|this|the\s+deal)|finaliz(e|ing)|accept\s+the\s+(price|deal)|chlo\s+(?:do\s+)?laga\s+do|chalo\s+(?:do\s+)?laga\s+do|laga\s+do|lag\s+do|deal\s+kar\s+do|final\s+kar\s+do|order\s+kar\s+do|payment\s+kar\s+(?:do|dunga)|le\s+lunga|le\s+lenge|ready\s+hoon|ready\s+hu|bhej\s+do)/i,
  mismatch: /\b(not\s+my\s+size|different\s+(size|colour|color|variant)|need(ed|s)?\s+it\s+in|available\s+in\s+my|wrong\s+(size|variant)|only\s+(left|have)\s+in)/i,
  trust: /\b(original|genuine|authentic|real|fake|duplicate|trust\b|reviews?|rating|scam|legit|certified)/i,
  quality: /\b(quality|durab(le|ility)|last\s+(long|for)|lasts\s+\w+|sturdy|flimsy|cheap(?:ly)?\s+made|well\s+made|build\s+quality|how\s+is\s+the\s+(build|quality)|broke|broken|defect(?:ive)?|damaged|worth\s+the\s+material)\b/i,
  availability: /\b(out\s+of\s+stock|in\s+stock|sold\s+out|restock|back\s+in\s+stock|when\s+.*(back|available)|is\s+it\s+available|do\s+you\s+(still\s+)?have\s+it)\b/i,
  hesitation: /\b(let\s+me\s+think|i'?ll\s+think|think\s+(about\s+it|it\s+over)|maybe\s+later|not\s+sure|not\s+ready|need\s+to\s+think|come\s+back\s+to|decide\s+later|sleep\s+on\s+it|not\s+right\s+now|just\s+(looking|browsing)|have\s+to\s+(check|ask)|let\s+me\s+(check|see|ask))\b/i,
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
  const text = ` ${normalizeCustomerText(message)} `
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

const COMPLEMENT_RE = /\b(go(?:es)?\s+with|pair(?:s|ed)?\s+with|match(?:es)?\s+with|combine|bundle\s+with|also\s+need|add\s+to\s+(?:my|this|the)\s+(?:order|cart)|complete\s+the\s+(?:look|set|kit)|accessor(?:y|ies)|together\s+with|what\s+else\s+(?:goes|works)|with\s+this\s+(?:one|item|product))\b/i

/** Deterministically pull a short product topic from the message, if any. */
export function extractNeed(message: string): string | null {
  const text = ` ${normalizeCustomerText(message).toLowerCase()} `
  const m = NEED_PATTERN.exec(text)
  if (!m) return null
  const words = m[1]
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS_NEED.has(w))
    .slice(0, 3)
  return words.length > 0 ? words.join(' ') : null
}

export function analyzeIntent(input: string): IntentAnalysis {
  const message = normalizeCustomerText(input)
  const text = ` ${message.trim().toLowerCase()} `
  const signals: string[] = []
  const hits = (key: keyof typeof RE, label: string): boolean => {
    const matched = RE[key].test(text)
    if (matched) signals.push(label)
    return matched
  }

  const isMoney = hits('money', 'money_amount')
  const isWalkout = hits('walkout', 'walkout')
  const asksBestPrice = hits('bestPriceAsk', 'best_price_ask')
  const priceIntent = hits('price', 'price_signal')
  const budgetIntent = hits('budget', 'budget_signal')
  const comparisonIntent = hits('comparison', 'comparison_signal')
  const productQ = hits('productQuestion', 'product_question')
  const valueIntent = hits('value', 'value_signal')
  const priceComplaint = hits('complaint', 'price_complaint')
  const purchaseIntent = hits('purchaseReady', 'purchase_signal')
  const mismatch = hits('mismatch', 'variant_mismatch')
  const trust = hits('trust', 'trust_signal')
  const quality = hits('quality', 'quality_signal')
  const availability = hits('availability', 'availability_signal')
  const hesitation = hits('hesitation', 'hesitation_signal')
  const shipping = hits('shipping', 'shipping_signal')
  const payment = hits('payment', 'payment_signal')
  const recRequest = hits('recommendationRequest', 'recommendation_request')
  const discovery = hits('discovery', 'discovery_signal')

  const budget = extractBudget(message)
  const need = extractNeed(message)
  const nonOfferNumberContext = classifyNonOfferNumber(message)
  const structuredOffer = parseStructuredOffer(message)
  const offerBasis = priceComplaint ? 'none' : structuredOffer.basis
  const offerClarificationNeeded = !priceComplaint && structuredOffer.needsClarification

  let intent: ShopperIntent = 'UNKNOWN'
  if (isWalkout) intent = 'WALKOUT'
  else if (hesitation) intent = 'PURCHASE_HESITATION'
  else if (purchaseIntent && !comparisonIntent) intent = 'PURCHASE_READY'
  else if (mismatch) intent = 'PRODUCT_MISMATCH'
  else if (productQ || trust || quality || availability) intent = 'PRODUCT_QUESTION'
  else if (comparisonIntent) intent = 'COMPARISON'
  else if (recRequest) intent = 'RECOMMENDATION_REQUEST'
  else if (discovery) intent = 'PRODUCT_DISCOVERY'
  else if (budgetIntent || budget) intent = 'BUDGET_CONSTRAINT'
  else if (asksBestPrice || priceIntent || isMoney || priceComplaint) intent = 'PRICE_ONLY'
  else if (valueIntent) intent = 'VALUE_UNCLEAR'
  else if (message.trim().length > 0) intent = 'GENERIC_CHAT'

  // Specific, non-price signals win over the generic price signal so that
  // e.g. "shipping cost is a lot" is a SHIPPING objection, not a PRICE one.
  let objection: ShopperObjection = null
  if (mismatch) objection = 'FIT_VARIANT'
  else if (availability) objection = 'AVAILABILITY'
  else if (trust) objection = 'TRUST'
  else if (quality) objection = 'QUALITY'
  else if (shipping) objection = 'SHIPPING'
  else if (comparisonIntent) objection = 'COMPARISON'
  else if (hesitation) objection = 'PURCHASE_HESITATION'
  else if (budgetIntent || budget) objection = 'BUDGET'
  else if (asksBestPrice || priceIntent || isMoney || priceComplaint) objection = 'PRICE'
  else if (productQ) objection = 'PRODUCT_INFORMATION'
  else if (payment) objection = 'PAYMENT_FRICTION'
  else if (valueIntent) objection = 'VALUE'

  const analysis: Omit<IntentAnalysis, 'shopperCategory' | 'shopperCategoryName'> = {
    intent,
    objection,
    signals,
    offersPriceSignal: extractPrice(message) !== null,
    budget: budget?.amount ?? null,
    budgetType: budget?.type ?? null,
    priceComplaint,
    offerBasis,
    offerQuantity: structuredOffer.quantity,
    offerClarificationNeeded,
    nonOfferNumberContext,
    asksBestPrice,
    need,
    category: objectionCategory(objection),
  }
  const shopperCategory = classifyShopperIntentCategory(analysis, message)
  return {
    ...analysis,
    shopperCategory: shopperCategory.code,
    shopperCategoryName: shopperCategory.name,
  }
}

type IntentForCategory = Pick<IntentAnalysis, 'intent' | 'objection' | 'category' | 'priceComplaint' | 'budget' | 'budgetType' | 'offersPriceSignal'>

export function classifyShopperIntentCategory(analysis: IntentForCategory, message?: string): ShopperIntentCategory {
  const build = (code: ShopperIntentCategoryCode): ShopperIntentCategory => ({
    ...SHOPPER_INTENT_CATEGORIES[code],
    intent: analysis.intent,
  })
  const text = message ?? ''

  if (COMPLEMENT_RE.test(text)) return build('K')
  if (analysis.intent === 'RECOMMENDATION_REQUEST' || analysis.intent === 'PRODUCT_DISCOVERY') return build('J')
  if (analysis.intent === 'PURCHASE_READY') return build('H')
  if (
    analysis.intent === 'WALKOUT' ||
    analysis.intent === 'PURCHASE_HESITATION' ||
    analysis.intent === 'UNKNOWN' ||
    analysis.intent === 'GENERIC_CHAT'
  ) return build('I')
  if (analysis.objection === 'TRUST') return build('E')
  if (analysis.objection === 'QUALITY') return build('C')
  if (analysis.intent === 'PRODUCT_QUESTION' || analysis.objection === 'PRODUCT_INFORMATION' || analysis.objection === 'SHIPPING' || analysis.objection === 'SHIPPING_DELAY' || analysis.objection === 'PAYMENT_FRICTION') return build('D')
  if (analysis.intent === 'COMPARISON' || analysis.objection === 'COMPARISON') return build('F')
  if (analysis.intent === 'PRODUCT_MISMATCH' || analysis.objection === 'FIT_VARIANT' || analysis.objection === 'AVAILABILITY') return build('G')
  if (analysis.intent === 'BUDGET_CONSTRAINT' || analysis.objection === 'BUDGET') return build('B')
  if (analysis.priceComplaint || analysis.objection === 'PRICE' || analysis.objection === 'VALUE' || analysis.intent === 'PRICE_ONLY' || analysis.intent === 'VALUE_UNCLEAR') return build('A')
  return build('I')
}

export function hasExplicitRecommendationAsk(analysis: IntentForCategory, message?: string): boolean {
  const category = classifyShopperIntentCategory(analysis, message)
  return category.code === 'J' || category.code === 'K'
}

/** Map the fine-grained objection onto the published nine-category taxonomy. */
export function objectionCategory(objection: ShopperObjection): ObjectionCategory {
  switch (objection) {
    case 'PRICE':
    case 'VALUE':
      return 'PRICE_OBJECTION'
    case 'BUDGET':
      return 'BUDGET_OBJECTION'
    case 'SHIPPING':
    case 'SHIPPING_DELAY':
      return 'SHIPPING_OBJECTION'
    case 'QUALITY':
      return 'QUALITY_OBJECTION'
    case 'TRUST':
      return 'TRUST_OBJECTION'
    case 'PRODUCT_INFORMATION':
    case 'FIT_VARIANT':
    case 'AVAILABILITY':
      return 'PRODUCT_INFORMATION'
    case 'COMPARISON':
      return 'COMPARISON_OBJECTION'
    case 'PURCHASE_HESITATION':
      return 'PURCHASE_HESITATION'
    default:
      return 'OTHER_OR_UNKNOWN'
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
  PURCHASE_HESITATION: 'interested but not ready — needs reassurance or time, not necessarily a discount',
  WALKOUT: 'threatening to leave the negotiation',
  GENERIC_CHAT: 'casual conversation',
  RECOMMENDATION_REQUEST: 'asking for other product options from this store',
  PRODUCT_DISCOVERY: 'browsing — wants the store to surface matching products',
}

const OBJECTION_LABEL: Record<NonNullable<ShopperObjection>, string> = {
  PRICE: 'price objection — respond with value framing and a concrete counter',
  BUDGET: 'budget objection — the shopper has a hard ceiling; meet it if the floor allows, otherwise pivot to alternatives ONCE',
  SHIPPING: 'shipping-cost objection — explain the real shipping options/incentives; do not discount the product to hide shipping',
  QUALITY: 'quality/durability concern — explain verified materials/build/benefits only; never invent certifications',
  FIT_VARIANT: 'variant/size mismatch — steer to the matching option if verified, otherwise honestly say you cannot confirm availability',
  AVAILABILITY: 'availability concern — only state verified stock; never fabricate',
  TRUST: 'trust/authenticity concern — use only merchant-approved selling points; never invent credentials',
  SHIPPING_DELAY: 'shipping/timeline concern — do not promise delivery times you cannot verify',
  COMPARISON: 'comparison objection — explain factual, verified differentiators; never invent a competitor price',
  PRODUCT_INFORMATION: 'product-information need — answer from verified facts before any discount',
  PURCHASE_HESITATION: 'purchase hesitation — reassure and reduce friction; do NOT rush to a discount',
  PAYMENT_FRICTION: 'payment-method concern — reassure with the store\'s real options if known, otherwise offer checkout details',
  VALUE: 'value uncertainty — break what the price includes',
}

// Published intent→action mapping (Phase 1). Pure lookup, no side effects.
const CATEGORY_ACTION: Record<ObjectionCategory, string> = {
  PRICE_OBJECTION: 'smart bargaining',
  SHIPPING_OBJECTION: 'explain delivery options and eligible shipping incentives',
  QUALITY_OBJECTION: 'explain verified product benefits',
  TRUST_OBJECTION: 'provide genuine policies and verified information',
  BUDGET_OBJECTION: 'recommend alternatives or permitted offers',
  PRODUCT_INFORMATION: 'act as product expert',
  COMPARISON_OBJECTION: 'explain factual differentiators',
  PURCHASE_HESITATION: 'reduce friction and reassure; do not lead with a discount',
  OTHER_OR_UNKNOWN: 'ask a natural clarification question',
}

export function objectionAction(category: ObjectionCategory): string {
  return CATEGORY_ACTION[category]
}

// Compact prompt block placed in the SHOPPER INTENT section.
export function shopperIntentToPromptBlock(analysis: IntentAnalysis): string {
  const category = analysis.shopperCategory && SHOPPER_INTENT_CATEGORIES[analysis.shopperCategory]
    ? SHOPPER_INTENT_CATEGORIES[analysis.shopperCategory]
    : classifyShopperIntentCategory(analysis)
  const lines = [
    `SHOPPER INTENT (deterministic classification of the current message — reason about it, but never say "my model says"):`,
    `- Intent: ${INTENT_LABEL[analysis.intent]}`,
    `- Shopper category: ${category.code} (${category.name})`,
  ]
  if (analysis.objection) {
    lines.push(`- Objection detected: ${OBJECTION_LABEL[analysis.objection]}`)
    lines.push(`- Objection category: ${analysis.category} → recommended action: ${objectionAction(analysis.category)}`)
  }
  if (analysis.intent === 'PURCHASE_HESITATION') {
    lines.push(`- The shopper is hesitating, not rejecting. Do NOT lead with a discount — reduce friction, answer the real concern, and give them room.`)
  }
  if (analysis.asksBestPrice) {
    lines.push(
      `- The shopper is asking HOW LOW YOU CAN GO. Answer directly with the current honest price you can honor; do NOT ask them to name a price, do NOT repeat their question, and never describe them as loyal/returning unless CUSTOMER HISTORY confirms it. Never claim a number is your floor or absolute minimum.`,
    )
  }
  if (analysis.priceComplaint) {
    lines.push(
      `- The shopper is COMPLAINING about the price — they are NOT making an offer. Any figure in this message is the price they are objecting to. NEVER read it as their bid, NEVER echo it back as "you offered X", and NEVER accept it. Acknowledge the concern briefly, justify the value from verified facts, and propose a genuine counter (still above the listed-price gap you normally open with).`,
    )
  }
  if (analysis.offerClarificationNeeded) {
    lines.push(
      `- OFFER BASIS UNCLEAR: the shopper named an amount and a multi-unit quantity without making it clear whether the amount is PER ITEM or the TOTAL for all items. Ask ONE short clarifying question before quoting any number; do not accept, counter, or treat the amount as a per-unit bid.`,
    )
  } else if (analysis.offerBasis === 'total') {
    lines.push(
      `- The shopper's amount is explicitly a TOTAL for ${analysis.offerQuantity} units, not a per-item price. If you discuss a per-unit number, derive it from the server's authoritative answer only; never compute or promise it yourself.`,
    )
  } else if (analysis.offerBasis === 'per_unit') {
    lines.push(
      `- The shopper's amount is explicitly PER ITEM for a quantity of ${analysis.offerQuantity}. Never present it as the total order value.`,
    )
  }
  if (analysis.intent === 'COMPARISON' || analysis.objection === 'COMPARISON' || analysis.nonOfferNumberContext === 'comparison') {
    lines.push(
      `- COMPARISON HANDLING: this shopper is citing another brand/store, NOT making a bid. Do NOT say "nice try", "not serious", "can't go that low", or belittle their research. Acknowledge once, PITCH the verified value of THIS product in one line (approved selling point, verified description, vendor/type or tag), then close with a low-pressure question such as "Shall I lock it in for you?" Never invent a competitor price, stock, review or deadline.`,
    )
  }
  if (analysis.nonOfferNumberContext) {
    const labels: Record<Exclude<NonOfferNumberContext, null>, string> = {
      quantity: 'a quantity',
      identifier: 'an order/product/model/contact reference',
      budget: 'a budget ceiling',
      contact: 'a phone/contact detail',
      percent: 'a percentage',
      comparison: 'somebody else’s price',
      complaint: 'a price they are objecting to',
      reference: 'a listed/reference price',
      duration: 'a time or age',
      casual: 'a game/show/sport/trend, model/version, year, address or saving-goal reference',
    }
    lines.push(
      `- A number in this message is ${labels[analysis.nonOfferNumberContext]}, NOT an offer. Only a number the shopper clearly presents as what they will pay counts as a bid. Do not quote this number back as their offer, do not counter against it, and do not spend a negotiation move on it; answer the actual question or concern first.`,
    )
    if (analysis.nonOfferNumberContext === 'casual') {
      lines.push(
        `- CASUAL/TOPIC REFERENCE: if the shopper mentions games, shows, sport, creators, saving up for something else or another trend/topic, acknowledge it briefly in a natural, human way. Do not claim what is trending or invent facts about it, keep any humor kind, then return to the product, the real concern, or a genuine price question.`,
      )
    }
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
