import type { LearningContextInput, LearningFeatures } from './types'

export const GLOBAL_CONTEXT_KEY = '__global__'

const INTENT_GROUPS: Record<string, string> = {
  PRICE_ONLY: 'price',
  BUDGET_CONSTRAINT: 'budget',
  VALUE_UNCLEAR: 'value',
  COMPARISON: 'value',
  PRODUCT_QUESTION: 'product',
  PRODUCT_MISMATCH: 'product',
  RECOMMENDATION_REQUEST: 'product',
  PRODUCT_DISCOVERY: 'product',
  PURCHASE_READY: 'ready',
  WALKOUT: 'walkout',
  GENERIC_CHAT: 'chat',
  UNKNOWN: 'unknown',
}

export function intentGroup(intent: string | null): string {
  return (intent && INTENT_GROUPS[intent]) || 'unknown'
}

function bucketAmount(
  amount: number | null,
  floorPrice: number,
  originalPrice: number,
): string {
  if (amount == null || !Number.isFinite(amount)) return 'none'
  if (amount < floorPrice) return 'below_floor'
  const range = Math.max(0.01, originalPrice - floorPrice)
  const ratio = Math.min(1, Math.max(0, (amount - floorPrice) / range))
  if (ratio <= 0.15) return 'near_floor'
  if (ratio <= 0.5) return 'low_mid'
  if (ratio <= 0.85) return 'high_mid'
  return 'near_listing'
}

function offerBucket(
  offer: number | null,
  floorPrice: number,
  originalPrice: number,
): string {
  if (offer == null || !Number.isFinite(offer) || offer <= 0) return 'none'
  if (offer <= floorPrice * 0.5 || offer <= originalPrice * 0.1) return 'absurd'
  return bucketAmount(offer, floorPrice, originalPrice)
}

function roundsBucket(rounds: number): string {
  if (rounds <= 0) return 'opening'
  if (rounds <= 1) return 'early'
  if (rounds <= 3) return 'mid'
  return 'late'
}

export function buildLearningFeatures(
  input: LearningContextInput,
): LearningFeatures {
  const originalPrice = Math.max(0.01, input.originalPrice)
  const floorPrice = Math.min(originalPrice, Math.max(0, input.floorPrice))
  const intent = intentGroup(input.intent)
  const offer = offerBucket(input.offer, floorPrice, originalPrice)
  const budget = bucketAmount(input.budget, floorPrice, originalPrice)
  const recommendationEligible =
    input.recommendationsEnabled === true &&
    ((input.budget != null && input.budget < floorPrice) ||
      (input.bulkQuantity != null && input.bulkQuantity >= 2))
  const contextKey = `${input.config?.version ?? 'v1'}|${intent}|${offer}`

  return {
    intentGroup: intent,
    offerBucket: offer,
    budgetBucket: budget,
    roundsBucket: roundsBucket(input.rounds),
    recommendationEligible,
    contextKey,
  }
}
