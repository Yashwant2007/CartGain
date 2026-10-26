import type {
  LearningRewardBreakdown,
  LearningRewardInput,
  LearningRewardWeights,
} from './types'

const round4 = (n: number) => Math.round(n * 10000) / 10000
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function normalizeWeights(
  weights: Partial<LearningRewardWeights> = {},
): LearningRewardWeights {
  const raw = {
    conversion: Math.max(0, weights.conversion ?? 0.4),
    margin: Math.max(0, weights.margin ?? 0.3),
    experience: Math.max(0, weights.experience ?? 0.2),
    efficiency: Math.max(0, weights.efficiency ?? 0.1),
  }
  const total = raw.conversion + raw.margin + raw.experience + raw.efficiency
  if (total <= 0) return { conversion: 1, margin: 0, experience: 0, efficiency: 0 }
  return {
    conversion: raw.conversion / total,
    margin: raw.margin / total,
    experience: raw.experience / total,
    efficiency: raw.efficiency / total,
  }
}

export function computeLearningReward(
  input: LearningRewardInput,
): LearningRewardBreakdown {
  const originalPrice = Math.max(0.01, input.originalPrice)
  const floorPrice = Math.min(originalPrice, Math.max(0, input.floorPrice))
  const grossPurchase = Math.max(
    0,
    input.purchaseValue ?? input.finalPrice ?? 0,
  )
  const refunded = Math.max(0, Math.min(grossPurchase, input.refundedAmount || 0))
  const netPurchase = Math.max(0, grossPurchase - refunded)
  const purchasedNet =
    input.purchased &&
    netPurchase > 0.009 &&
    input.finalPrice != null &&
    Number.isFinite(input.finalPrice)
  const weights = normalizeWeights(input.weights)

  if (!purchasedNet) {
    return {
      total: 0,
      conversion: 0,
      margin: 0,
      experience: 0,
      efficiency: 0,
      purchasedNet: false,
    }
  }

  const refundRatio = grossPurchase > 0 ? netPurchase / grossPurchase : 0
  const effectiveFinal = Math.max(0, (input.finalPrice ?? 0) * refundRatio)
  const range = Math.max(0.01, originalPrice - floorPrice)
  const margin = clamp01((effectiveFinal - floorPrice) / range)

  const maxRounds = Math.max(1, input.maxRounds || 1)
  const rounds = Math.max(0, input.rounds || 0)
  const speed = clamp01(1 - rounds / maxRounds)
  const experience = clamp01(0.65 + speed * 0.35)
  const efficiency = clamp01(1 - Math.max(0, rounds - 1) / maxRounds)

  return {
    total: round4(
      weights.conversion +
        weights.margin * margin +
        weights.experience * experience +
        weights.efficiency * efficiency,
    ),
    conversion: round4(weights.conversion),
    margin: round4(weights.margin * margin),
    experience: round4(weights.experience * experience),
    efficiency: round4(weights.efficiency * efficiency),
    purchasedNet: true,
  }
}
