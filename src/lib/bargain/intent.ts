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

export type ShopperObjection =
  | null
  | 'PRICE'
  | 'FIT_VARIANT'
  | 'AVAILABILITY'
  | 'TRUST'
  | 'SHIPPING_DELAY'
  | 'PAYMENT_FRICTION'
  | 'VALUE'

export interface IntentAnalysis {
  intent: ShopperIntent
  objection: ShopperObjection
  signals: string[]
  offersPriceSignal: boolean
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

  let intent: ShopperIntent = 'UNKNOWN'
  if (isWalkout) intent = 'WALKOUT'
  else if (purchaseIntent && !comparisonIntent) intent = 'PURCHASE_READY'
  else if (mismatch) intent = 'PRODUCT_MISMATCH'
  else if (productQ || trust) intent = 'PRODUCT_QUESTION'
  else if (comparisonIntent) intent = 'COMPARISON'
  else if (budgetIntent) intent = 'BUDGET_CONSTRAINT'
  else if (priceIntent || isMoney) intent = 'PRICE_ONLY'
  else if (valueIntent) intent = 'VALUE_UNCLEAR'
  else if (message.trim().length > 0) intent = 'GENERIC_CHAT'

  let objection: ShopperObjection = null
  if (budgetIntent || priceIntent || isMoney) objection = 'PRICE'
  else if (mismatch) objection = 'FIT_VARIANT'
  else if (trust) objection = 'TRUST'
  else if (shipping && intent === 'UNKNOWN') objection = 'SHIPPING_DELAY'
  else if (shipping) objection = 'SHIPPING_DELAY'
  else if (payment) objection = 'PAYMENT_FRICTION'
  else if (valueIntent) objection = 'VALUE'

  return { intent, objection, signals, offersPriceSignal: isMoney }
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
  return lines.join('\n')
}

export function intentShortLabel(analysis: IntentAnalysis): string {
  return analysis.objection ? `${analysis.intent}:${analysis.objection}` : analysis.intent
}