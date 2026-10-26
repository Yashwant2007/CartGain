export const LEARNING_ENVIRONMENTS = ['production', 'demo'] as const
export type LearningEnvironment = (typeof LEARNING_ENVIRONMENTS)[number]

export const LEARNING_MODES = ['baseline', 'shadow', 'active', 'demo'] as const
export type LearningMode = (typeof LEARNING_MODES)[number]

export const LEARNING_STRATEGIES = [
  'BASELINE',
  'FRIENDLY',
  'VALUE',
  'GRADUAL',
  'BUDGET_ALTERNATIVE',
  'BUNDLE',
  'CONCISE',
  'FIRM',
  'PROMO',
] as const
export type LearningStrategy = (typeof LEARNING_STRATEGIES)[number]

export interface LearningConfigView {
  enabled: boolean
  shadowMode: boolean
  demoEnabled: boolean
  version: string
  explorationRate: number
  minSamplesPerArm: number
  attributionWindowDays: number
  eventRetentionDays: number
  rewardConversion: number
  rewardMargin: number
  rewardExperience: number
  rewardEfficiency: number
  allowedStrategies: string[]
  blockedStrategies: string[]
  promoStrategyEnabled: boolean
}

export interface LearningContextInput {
  originalPrice: number
  floorPrice: number
  offer: number | null
  budget: number | null
  intent: string | null
  objection: string | null
  rounds: number
  maxRounds: number
  recommendationsEnabled: boolean
  bulkQuantity?: number | null
  promoAvailable?: boolean
  config?: Partial<LearningConfigView> | null
}

export interface LearningFeatures {
  intentGroup: string
  offerBucket: string
  budgetBucket: string
  roundsBucket: string
  recommendationEligible: boolean
  contextKey: string
}

export interface ArmSnapshot {
  strategy: string
  pulls: number
  outcomes: number
  accepted: number
  purchased: number
  rewardSum: number
  rewardSqSum: number
  alpha: number
  beta: number
  contextKey: string
}

export interface LearningSelection {
  strategy: LearningStrategy
  appliedStrategy: LearningStrategy
  shadowStrategy: LearningStrategy | null
  baselineStrategy: LearningStrategy
  version: string
  contextKey: string
  mode: LearningMode
  features: LearningFeatures
  eligible: LearningStrategy[]
  isExploration: boolean
  reason: string
}

export interface LearningGuidance {
  strategy: LearningStrategy
  mode: LearningMode
  version: string
  contextKey: string
  prompt: string
  counterNudge: number
}

export interface LearningRewardWeights {
  conversion: number
  margin: number
  experience: number
  efficiency: number
}

export interface LearningRewardInput {
  originalPrice: number
  floorPrice: number
  finalPrice: number | null
  accepted: boolean
  purchased: boolean
  purchaseValue: number | null
  refundedAmount: number
  rounds: number
  maxRounds: number
  weights?: Partial<LearningRewardWeights>
}

export interface LearningRewardBreakdown {
  total: number
  conversion: number
  margin: number
  experience: number
  efficiency: number
  purchasedNet: boolean
}
