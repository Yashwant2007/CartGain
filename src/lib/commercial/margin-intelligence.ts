export type CustomerIntentClass =
  | 'high_purchase_intent'
  | 'high_abandonment_risk'
  | 'price_sensitive'
  | 'returning_loyal'
  | 'discount_hunter'
  | 'browsing'
  | 'uncertain'

export type IncentiveType =
  | 'full_price_encouragement'
  | 'loyalty_non_cash_perk'
  | 'contextual_negotiation'
  | 'bundle_value'
  | 'free_shipping'
  | 'non_cash_incentive'
  | 'limited_authorized_discount'
  | 'no_automatic_financial_incentive'

export interface MarginBehaviorSignals {
  productDwellMs?: number | null
  scrollDepthPercent?: number | null
  exitIntentObserved?: boolean | null
  mobileBehaviorSignal?: 'none' | 'repeat_view' | 'cart_return' | 'message_open' | null
  cartCreated?: boolean | null
  cartAbandoned?: boolean | null
  repeatVisits?: number | null
  previousPurchases?: number | null
  previousCouponUses?: number | null
  bargainAttempts?: number | null
  priceComplaints?: number | null
  explicitBudgetCap?: boolean | null
  discountCodeMentions?: number | null
  recoveryMessageEngagement?: 'none' | 'opened' | 'clicked' | 'replied' | null
  cartValueMinor?: number | null
  productMarginBps?: number | null
  shippingCostMinor?: number | null
  shippingSensitive?: boolean | null
  bundleEligible?: boolean | null
  inventoryAvailable?: boolean | null
}

export interface MerchantMarginPolicy {
  configured?: boolean | null
  minSellingPriceMinor?: number | null
  minGrossMarginBps?: number | null
  maxDiscountBps?: number | null
  productDiscountRestricted?: boolean | null
  shippingIncentiveLimitMinor?: number | null
  bundleEligible?: boolean | null
  customerDiscountLimitBps?: number | null
  maxBargainAttempts?: number | null
  campaignSpendLimitMinor?: number | null
}

export interface IntentClassification {
  category: CustomerIntentClass
  confidence: number
  evidenceCount: number
  uncertaintyFallback: boolean
  rationaleCodes: string[]
}

export interface IncentiveDecision {
  type: IncentiveType
  financialIncentiveAllowed: boolean
  requiresDeterministicPriceValidation: boolean
  confidence: number
  rationaleCodes: string[]
  uncertaintyFallback: boolean
}

export interface MarginDecision {
  intent: IntentClassification
  incentive: IncentiveDecision
  policySafe: boolean
  rationaleCodes: string[]
}

const positive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const nonNegative = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

function evidence(signals: MarginBehaviorSignals): string[] {
  const codes: string[] = []
  if (signals.cartCreated === true) codes.push('CART_CREATED')
  if (signals.cartAbandoned === true) codes.push('CART_ABANDONED')
  if (positive(signals.productDwellMs) && (signals.productDwellMs as number) >= 45000) codes.push('PRODUCT_DWELL')
  if (positive(signals.scrollDepthPercent) && (signals.scrollDepthPercent as number) >= 70) codes.push('SCROLL_DEPTH')
  if (signals.exitIntentObserved === true) codes.push('EXIT_INTENT')
  if (signals.mobileBehaviorSignal && signals.mobileBehaviorSignal !== 'none') codes.push('MOBILE_ENGAGEMENT')
  if (nonNegative(signals.repeatVisits) && (signals.repeatVisits as number) >= 1) codes.push('REPEAT_VISIT')
  if (nonNegative(signals.previousPurchases) && (signals.previousPurchases as number) >= 1) codes.push('PRIOR_PURCHASE')
  if (nonNegative(signals.previousCouponUses) && (signals.previousCouponUses as number) >= 1) codes.push('COUPON_HISTORY')
  if (nonNegative(signals.bargainAttempts) && (signals.bargainAttempts as number) >= 1) codes.push('BARGAIN_ATTEMPT')
  if (nonNegative(signals.priceComplaints) && (signals.priceComplaints as number) >= 1) codes.push('PRICE_COMPLAINT')
  if (signals.explicitBudgetCap === true) codes.push('BUDGET_CAP')
  if (nonNegative(signals.discountCodeMentions) && (signals.discountCodeMentions as number) >= 1) codes.push('DISCOUNT_CODE_MENTION')
  if (signals.recoveryMessageEngagement && signals.recoveryMessageEngagement !== 'none') codes.push('MESSAGE_ENGAGEMENT')
  return codes
}

function confidenceFor(count: number, category: CustomerIntentClass): number {
  if (category === 'uncertain') return Math.min(0.5, Math.round((0.25 + count * 0.05) * 100) / 100)
  return Math.min(0.95, Math.round((0.45 + count * 0.1) * 100) / 100)
}

export function classifyCustomerIntent(signals: MarginBehaviorSignals): IntentClassification {
  const codes = evidence(signals)
  const has = (code: string) => codes.includes(code)
  const couponHistory = nonNegative(signals.previousCouponUses) && signals.previousCouponUses >= 2
  const discountMentions = nonNegative(signals.discountCodeMentions) && signals.discountCodeMentions >= 2
  const priceComplaints = nonNegative(signals.priceComplaints) && signals.priceComplaints >= 2
  const repeatPurchase = nonNegative(signals.previousPurchases) && signals.previousPurchases >= 2

  let category: CustomerIntentClass = 'uncertain'
  let rationaleCodes: string[] = []

  if (couponHistory && discountMentions && priceComplaints) {
    category = 'discount_hunter'
    rationaleCodes = ['COUPON_HISTORY', 'DISCOUNT_CODE_MENTION', 'PRICE_COMPLAINT']
  } else if (repeatPurchase && has('REPEAT_VISIT')) {
    category = 'returning_loyal'
    rationaleCodes = ['PRIOR_PURCHASE', 'REPEAT_VISIT']
  } else if (has('CART_CREATED') && (has('PRODUCT_DWELL') || has('SCROLL_DEPTH') || has('MESSAGE_ENGAGEMENT'))) {
    category = 'high_purchase_intent'
    rationaleCodes = ['CART_CREATED', ...codes.filter((code) => ['PRODUCT_DWELL', 'SCROLL_DEPTH', 'MESSAGE_ENGAGEMENT'].includes(code))]
  } else if (has('CART_ABANDONED') && (has('EXIT_INTENT') || has('MOBILE_ENGAGEMENT') || has('REPEAT_VISIT'))) {
    category = 'high_abandonment_risk'
    rationaleCodes = ['CART_ABANDONED', ...codes.filter((code) => ['EXIT_INTENT', 'MOBILE_ENGAGEMENT', 'REPEAT_VISIT'].includes(code))]
  } else if (has('PRICE_COMPLAINT') || has('BUDGET_CAP')) {
    category = 'price_sensitive'
    rationaleCodes = codes.filter((code) => ['PRICE_COMPLAINT', 'BUDGET_CAP'].includes(code))
  } else if (codes.length === 0 || (!has('CART_CREATED') && !has('MESSAGE_ENGAGEMENT'))) {
    category = 'browsing'
    rationaleCodes = codes.length > 0 ? codes : ['NO_BEHAVIORAL_SIGNALS']
  }

  const evidenceCount = category === 'browsing' && codes.length === 0 ? 0 : Math.max(codes.length, rationaleCodes.length)
  return {
    category,
    confidence: confidenceFor(evidenceCount, category),
    evidenceCount,
    uncertaintyFallback: category === 'uncertain' || evidenceCount < 2,
    rationaleCodes,
  }
}

export function selectMarginIncentive(
  signals: MarginBehaviorSignals,
  policy: MerchantMarginPolicy,
  intent: IntentClassification = classifyCustomerIntent(signals),
): IncentiveDecision {
  const reasons = [...intent.rationaleCodes]
  const policyConfigured = policy.configured === true
  const attemptsUsed = nonNegative(signals.bargainAttempts) ? signals.bargainAttempts : 0
  const attemptsExceeded = policy.maxBargainAttempts != null && attemptsUsed >= policy.maxBargainAttempts
  const marginProtected =
    (policy.minGrossMarginBps != null && (nonNegative(signals.productMarginBps) ? signals.productMarginBps : 10000) < policy.minGrossMarginBps) ||
    policy.productDiscountRestricted === true ||
    policy.maxDiscountBps === 0 ||
    policy.customerDiscountLimitBps === 0
  const campaignCapped =
    policy.campaignSpendLimitMinor != null &&
    positive(signals.cartValueMinor) &&
    signals.cartValueMinor > policy.campaignSpendLimitMinor
  const bundleAllowed = policy.bundleEligible === true && signals.bundleEligible === true && signals.inventoryAvailable !== false

  let type: IncentiveType = 'no_automatic_financial_incentive'
  let financial = false
  let deterministic = false

  if (signals.inventoryAvailable === false) {
    reasons.push('INVENTORY_UNAVAILABLE')
  } else if (attemptsExceeded) {
    reasons.push('BARGAIN_ATTEMPTS_EXHAUSTED')
  } else if (intent.category === 'high_purchase_intent') {
    type = 'full_price_encouragement'
    reasons.push('HIGH_PURCHASE_INTENT')
  } else if (intent.category === 'returning_loyal') {
    type = 'loyalty_non_cash_perk'
    reasons.push('RETURNING_LOYAL')
  } else if (intent.category === 'high_abandonment_risk') {
    if (!policyConfigured || marginProtected || campaignCapped) {
      type = 'non_cash_incentive'
      reasons.push('MARGIN_PROTECTED_NEGOTIATION')
    } else {
      type = 'contextual_negotiation'
      financial = true
      deterministic = true
      reasons.push('HIGH_ABANDONMENT_RISK')
    }
  } else if (intent.category === 'price_sensitive') {
    if (bundleAllowed) {
      type = 'bundle_value'
      financial = true
      deterministic = true
      reasons.push('BUNDLE_ELIGIBLE')
    } else if (policyConfigured && !marginProtected && !campaignCapped) {
      type = 'limited_authorized_discount'
      financial = true
      deterministic = true
      reasons.push('PRICE_SENSITIVE_AUTHORIZED')
    } else {
      type = 'non_cash_incentive'
      reasons.push('PRICE_SENSITIVE_NON_CASH')
    }
  } else if (signals.shippingSensitive === true) {
    if (
      policyConfigured &&
      policy.shippingIncentiveLimitMinor != null &&
      nonNegative(signals.shippingCostMinor) &&
      signals.shippingCostMinor <= policy.shippingIncentiveLimitMinor
    ) {
      type = 'free_shipping'
      financial = true
      deterministic = true
      reasons.push('SHIPPING_INCENTIVE_AUTHORIZED')
    } else {
      type = 'non_cash_incentive'
      reasons.push('SHIPPING_INCENTIVE_NOT_CONFIGURED')
    }
  } else if (intent.category === 'discount_hunter') {
    type = 'non_cash_incentive'
    reasons.push('DISCOUNT_HUNTER_BOUNDARY')
  } else {
    reasons.push('UNCERTAIN_BEHAVIOR')
  }

  return {
    type,
    financialIncentiveAllowed: financial,
    requiresDeterministicPriceValidation: deterministic,
    confidence: intent.confidence,
    rationaleCodes: Array.from(new Set(reasons)),
    uncertaintyFallback: intent.uncertaintyFallback || type === 'no_automatic_financial_incentive',
  }
}

export function evaluateMarginDecision(
  signals: MarginBehaviorSignals,
  policy: MerchantMarginPolicy,
): MarginDecision {
  const intent = classifyCustomerIntent(signals)
  const incentive = selectMarginIncentive(signals, policy, intent)
  const policySafe =
    signals.inventoryAvailable !== false &&
    (policy.maxBargainAttempts == null || (nonNegative(signals.bargainAttempts) ? signals.bargainAttempts : 0) < policy.maxBargainAttempts)
  return {
    intent,
    incentive,
    policySafe,
    rationaleCodes: Array.from(new Set([...intent.rationaleCodes, ...incentive.rationaleCodes])),
  }
}
