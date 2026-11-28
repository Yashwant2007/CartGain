import type { ClaimAssessment } from '../claims'
import type { SocialSignals } from '../behavior'
import type { IntentAnalysis, ShopperIntent } from '../intent'
import type { LiveTurnAnalysis } from '../live-turn'
import type { ProductContext } from '../product-context'
import type { AdaptiveContext } from '../learning/behavior-context'
import type { SessionMemory } from '../session-memory'
import type { StructuredOffer } from '../offer-structure'
import type {
  BudgetSignal,
  ClaimRisk,
  CustomerUnderstandingSnapshot,
  EngagementLevel,
  IntelligenceHistoryEntry,
  PricePosture,
  PurchaseReadiness,
  UrgencyLevel,
} from './types'

interface CustomerUnderstandingInput {
  message: string
  intent: IntentAnalysis
  claims?: ClaimAssessment | null
  product?: ProductContext | null
  signals?: SocialSignals | null
  liveTurn?: LiveTurnAnalysis | null
  adaptive?: AdaptiveContext | null
  sessionMemory?: SessionMemory | null
  customerOffer?: number | null
  offerStructure?: StructuredOffer | null
  originalPrice: number
  history: IntelligenceHistoryEntry[]
  sessionStatus?: string | null
  dealAccepted?: boolean
  pendingAccept?: boolean
  checkoutStarted?: boolean
  couponMentioned?: boolean
}

const HIGH_ENGAGEMENT_MODES = new Set(['price', 'purchase', 'question', 'frustrated'])
const LOW_ENGAGEMENT_MODES = new Set(['random', 'nonsense', 'emoji_only', 'greeting', 'small_talk'])
const HIGH_URGENCY_MODES = new Set(['walkout', 'frustrated', 'insult', 'purchase'])
const HIGH_CLAIM_STATUSES = new Set(['contradicted', 'malicious'])
const MEDIUM_CLAIM_STATUSES = new Set(['unverified', 'ambiguous', 'outdated', 'unverifiable'])
const SUPPORTED_CLAIM_STATUSES = new Set(['supported', 'verified'])

function budgetSignalFor(intent: IntentAnalysis): BudgetSignal {
  if (intent.budget == null || intent.budgetType == null) return 'none'
  return intent.budgetType
}

function pricePostureFor(input: CustomerUnderstandingInput): PricePosture {
  const { intent, customerOffer, originalPrice } = input
  const needsClarification = input.offerStructure?.needsClarification ?? intent.offerClarificationNeeded
  if (needsClarification) return 'unclear'
  if (customerOffer != null && Number.isFinite(customerOffer) && customerOffer > originalPrice) return 'over_list'
  if (intent.offersPriceSignal && !intent.priceComplaint && customerOffer != null) return 'bid'
  if (intent.budgetType === 'maximum' || intent.intent === 'BUDGET_CONSTRAINT') return 'budget_cap'
  if (intent.priceComplaint) return 'complaint'
  if (intent.asksBestPrice) return 'best_price_ask'
  return 'none'
}

function engagementFor(input: CustomerUnderstandingInput): EngagementLevel {
  const { signals, liveTurn, adaptive, sessionMemory, history, customerOffer } = input
  if (adaptive?.behavior === 'hostile' || adaptive?.behavior === 'chaotic' || sessionMemory?.seriousness === 'time_waster') return 'low'
  if (liveTurn?.mode && LOW_ENGAGEMENT_MODES.has(liveTurn.mode)) return 'low'
  if (customerOffer != null || signals?.verbose || signals?.question || sessionMemory?.seriousness === 'serious') return 'high'
  if (liveTurn?.mode && HIGH_ENGAGEMENT_MODES.has(liveTurn.mode)) return 'high'
  if (history.filter((entry) => entry.role === 'customer').length >= 3) return 'medium'
  return 'medium'
}

function urgencyFor(input: CustomerUnderstandingInput): UrgencyLevel {
  const { signals, liveTurn, intent } = input
  if (signals?.urgent || liveTurn?.mode === 'walkout' || intent.intent === 'WALKOUT') return 'high'
  if (liveTurn?.mode === 'frustrated' || signals?.emotion === 'frustrated') return 'high'
  if (intent.intent === 'PURCHASE_READY' || intent.intent === 'PURCHASE_HESITATION') return 'normal'
  if (liveTurn?.mode && HIGH_URGENCY_MODES.has(liveTurn.mode)) return 'high'
  return 'none'
}

function readinessFor(input: CustomerUnderstandingInput): PurchaseReadiness {
  const { intent, dealAccepted, sessionStatus, checkoutStarted } = input
  if (dealAccepted || checkoutStarted || sessionStatus === 'accepted' || sessionStatus === 'purchased') return 'committed'
  if (input.pendingAccept) return 'ready'
  if (intent.intent === 'PURCHASE_READY') return 'ready'
  if (intent.intent === 'PURCHASE_HESITATION' || intent.priceComplaint || intent.asksBestPrice) return 'evaluating'
  if (intent.intent === 'PRODUCT_QUESTION' || intent.intent === 'PRODUCT_DISCOVERY' || intent.intent === 'RECOMMENDATION_REQUEST') return 'exploring'
  return 'unaware'
}

function productKnowledgeFor(product?: ProductContext | null): CustomerUnderstandingSnapshot['productKnowledge'] {
  if (!product || product.fetchFailed) return 'unavailable'
  if (!product.selectedVariant || !product.title) return 'partial'
  if (product.activePromotions.length === 0 && product.merchantApprovedSellingPoints.length === 0 && product.merchantFaq.length === 0) return 'partial'
  return 'verified'
}

function claimRiskFor(claims?: ClaimAssessment | null): ClaimRisk {
  if (!claims || claims.claims.length === 0) return 'none'
  if (claims.manipulation || claims.hasContradiction || claims.claims.some((claim) => HIGH_CLAIM_STATUSES.has(claim.status))) return 'high'
  if (claims.hasUnverified || claims.claims.some((claim) => MEDIUM_CLAIM_STATUSES.has(claim.status))) return 'medium'
  if (claims.claims.some((claim) => SUPPORTED_CLAIM_STATUSES.has(claim.status))) return 'low'
  return 'none'
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function secondaryIntentsFor(input: CustomerUnderstandingInput): ShopperIntent[] {
  const found: ShopperIntent[] = []
  if (input.intent.priceComplaint || input.intent.offersPriceSignal) found.push('PRICE_ONLY')
  if (input.intent.budget != null) found.push('BUDGET_CONSTRAINT')
  if (input.signals?.question || /\?/.test(input.message)) found.push('PRODUCT_QUESTION')
  if (input.intent.category === 'COMPARISON_OBJECTION' || input.intent.objection === 'COMPARISON') found.push('COMPARISON')
  if (input.intent.objection === 'AVAILABILITY' || input.intent.objection === 'FIT_VARIANT') found.push('PRODUCT_MISMATCH')
  if (input.intent.intent === 'RECOMMENDATION_REQUEST') found.push('RECOMMENDATION_REQUEST')
  if (input.intent.asksBestPrice || input.intent.salesPitchRequest) found.push('VALUE_UNCLEAR')
  if (input.intent.objection === 'PURCHASE_HESITATION') found.push('PURCHASE_HESITATION')
  if (input.intent.intent === 'WALKOUT') found.push('WALKOUT')
  if (input.dealAccepted || input.checkoutStarted) found.push('PURCHASE_READY')
  return unique(found).filter((intent) => intent !== input.intent.intent).slice(0, 5)
}

function requirementsFor(input: CustomerUnderstandingInput): string[] {
  const found: string[] = []
  if (input.intent.need) found.push(`need:${input.intent.need}`)
  if (input.intent.budget != null) found.push(`budget:${input.intent.budgetType ?? 'unspecified'}:${input.intent.budget}`)
  if ((input.offerStructure?.quantity ?? 1) > 1) found.push(`quantity:${input.offerStructure?.quantity}`)
  if (/\b(?:size|colour|color|variant|model|storage|capacity|dimension|measurement)\b/i.test(input.message)) found.push('fit_or_variant')
  if (input.intent.objection === 'AVAILABILITY') found.push('availability')
  if (input.intent.objection === 'SHIPPING' || input.intent.objection === 'SHIPPING_DELAY') found.push('delivery_timing')
  if (input.signals?.urgent) found.push('time_sensitive')
  return unique(found).slice(0, 8)
}

function referencesFor(input: CustomerUnderstandingInput): string[] {
  const found: string[] = []
  if (input.intent.category === 'COMPARISON_OBJECTION' || input.intent.objection === 'COMPARISON') found.push('competitor')
  if (input.couponMentioned) found.push('coupon')
  if (/\b(?:reviews?|ratings?|rated)\b/i.test(input.message)) found.push('reviews')
  if (/\b(?:warranty|guarantee|certified|authentic)\b/i.test(input.message)) found.push('proof_request')
  if (/\b(?:everyone|popular|bestseller|my friend|people say)\b/i.test(input.message)) found.push('social_proof')
  if (/\b(?:last (?:week|month|year)|previously|before|used to)\b/i.test(input.message)) found.push('prior_experience')
  return unique(found).slice(0, 6)
}

function communicationStyleFor(input: CustomerUnderstandingInput): CustomerUnderstandingSnapshot['communicationStyle'] {
  if (input.sessionMemory?.tone) return input.sessionMemory.tone
  if (input.signals?.terse) return 'brief'
  if (input.signals?.polite) return 'warm'
  if (input.signals?.emotion === 'playful' || input.signals?.enthusiastic) return 'playful'
  if (input.signals?.verbose) return 'detailed'
  return 'calm'
}

export function buildCustomerUnderstanding(input: CustomerUnderstandingInput): CustomerUnderstandingSnapshot {
  const statuses = unique((input.claims?.claims ?? []).map((claim) => claim.status)).slice(0, 8)
  const categories = unique((input.claims?.claims ?? []).map((claim) => claim.category)).slice(0, 8)
  return {
    intent: input.intent.intent,
    objection: input.intent.objection,
    objectionCategory: input.intent.category,
    budgetSignal: budgetSignalFor(input.intent),
    pricePosture: pricePostureFor(input),
    emotion: input.signals?.emotion ?? input.sessionMemory?.emotion ?? 'neutral',
    engagement: engagementFor(input),
    urgency: urgencyFor(input),
    readiness: readinessFor(input),
    repeatPattern: input.signals?.reasking === true || input.liveTurn?.mode === 'reask',
    hasRealOffer: input.customerOffer != null && Number.isFinite(input.customerOffer) && !(
      input.offerStructure?.needsClarification ?? input.intent.offerClarificationNeeded
    ),
    offerBasis: input.offerStructure?.basis ?? input.intent.offerBasis,
    offerQuantity: input.offerStructure?.quantity ?? input.intent.offerQuantity,
    offerClarificationNeeded: input.offerStructure?.needsClarification ?? input.intent.offerClarificationNeeded,
    offerAmount: input.offerStructure?.rawAmount ?? null,
    offerUnitAmount: input.offerStructure?.unitPrice ?? null,
    offerTotalAmount: input.offerStructure?.totalAmount ?? null,
    secondaryIntents: secondaryIntentsFor(input),
    requirements: requirementsFor(input),
    references: referencesFor(input),
    communicationStyle: communicationStyleFor(input),
    unansweredQuestion: Boolean(input.signals?.question || /\?/.test(input.message)) && !input.history.some((entry) => entry.role === 'ai'),
    productKnowledge: productKnowledgeFor(input.product),
    claimRisk: claimRiskFor(input.claims),
    claimStatuses: statuses,
    claimCategories: categories,
  }
}
