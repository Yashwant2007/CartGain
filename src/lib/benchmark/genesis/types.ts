export const GENESIS_SUITE_NAME = 'CARTGAIN_GENESIS_BENCHMARK'

export const GENESIS_CATEGORIES = [
  'serious_bargain_hunters',
  'difficult_customers',
  'customer_psychology',
  'salesperson_intelligence',
  'humor_personality',
  'social_trend_references',
  'upselling_cross_selling',
  'price_floor_protection',
  'multi_turn_negotiation',
  'weird_scenarios',
  'speed_reliability',
  'ultimate_conversion_challenge',
] as const

export type GenesisCategory = (typeof GENESIS_CATEGORIES)[number]

export const GENESIS_CATEGORY_LABELS: Record<GenesisCategory, string> = {
  serious_bargain_hunters: 'serious bargain hunters',
  difficult_customers: 'difficult customers',
  customer_psychology: 'customer psychology',
  salesperson_intelligence: 'salesperson intelligence',
  humor_personality: 'humor/personality',
  social_trend_references: 'social/trend references',
  upselling_cross_selling: 'upselling/cross-selling',
  price_floor_protection: 'price-floor protection',
  multi_turn_negotiation: 'multi-turn negotiation',
  weird_scenarios: 'weird scenarios',
  speed_reliability: 'speed/reliability',
  ultimate_conversion_challenge: 'ultimate conversion challenge',
}

export const GENESIS_CATEGORY_WEIGHTS: Record<GenesisCategory, number> = {
  serious_bargain_hunters: 8,
  difficult_customers: 8,
  customer_psychology: 7,
  salesperson_intelligence: 9,
  humor_personality: 6,
  social_trend_references: 5,
  upselling_cross_selling: 8,
  price_floor_protection: 18,
  multi_turn_negotiation: 12,
  weird_scenarios: 8,
  speed_reliability: 6,
  ultimate_conversion_challenge: 5,
}

export const GENESIS_UNVERIFIED_QUALITY_CATEGORIES: ReadonlySet<GenesisCategory> = new Set<GenesisCategory>([
  'serious_bargain_hunters',
  'difficult_customers',
  'customer_psychology',
  'salesperson_intelligence',
  'humor_personality',
  'social_trend_references',
  'upselling_cross_selling',
  'weird_scenarios',
  'ultimate_conversion_challenge',
])

export const GENESIS_ENGINES = ['primary', 'fallback', 'deterministic'] as const
export type GenesisEngine = (typeof GENESIS_ENGINES)[number]

export const GENESIS_LIVE_VERIFICATION = 'live_provider_unreviewed_quality' as const

export type GenesisVerification =
  | 'verified_assertions'
  | 'simulated_unverified_ai_quality'
  | 'pending_external_verification'
  | typeof GENESIS_LIVE_VERIFICATION

export type GenesisCheckKind = 'objective' | 'quality' | 'pending'

export interface GenesisCheck {
  id: string
  kind: GenesisCheckKind
  passed: boolean
  evidence: string
}

export interface GenesisCaseResult {
  id: string
  title: string
  category: GenesisCategory
  engine: GenesisEngine
  verification: GenesisVerification
  decision: string
  replyLength: number
  counterOffer?: number
  latencyMs: number
  checks: GenesisCheck[]
  passed: boolean
}

export type GenesisFailureMode =
  | 'none'
  | 'primary_unavailable'
  | 'fallback_unavailable'
  | 'both_unavailable'
  | 'invalid_response'
  | 'timeout'
  | 'rate_limit'

export type GenesisScenarioKind =
  | 'offer'
  | 'opening'
  | 'boundary'
  | 'walkout'
  | 'opt_out'
  | 'token'
  | 'recommendation'
  | 'state'
  | 'product'
  | 'coupon'
  | 'dedupe'

export type GenesisDecision = 'accept' | 'counter' | 'reject' | 'welcome' | 'chat' | 'error'

export interface GenesisScenario {
  id: string
  category: GenesisCategory
  title: string
  kind: GenesisScenarioKind
  message: string
  persona?: 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'
  failureMode?: GenesisFailureMode
  offer?: number | null
  expectedDecision?: GenesisDecision
  expectedCounterOffer?: number
  attemptsUsed?: number
  lastCounter?: number | null
  bulkQuantity?: number
  strictness?: 'lenient' | 'standard' | 'strict'
  sessionKey?: string
  metadata?: Record<string, string | number | boolean | null>
}

export const GENESIS_PRODUCT_TITLE = 'Genesis Benchmark Product'

export const GENESIS_PRICE_CONTEXT = {
  originalPrice: 3499,
  maxDiscountPercent: 20,
  floorPrice: 2799.2,
  currencySymbol: '\u20b9',
  storeId: 'genesis-benchmark-store',
  productId: 'gid://shopify/Product/genesis-benchmark',
} as const

export const GENESIS_REQUIRED_OFFERS = [3000, 2800, 2500, 2650, 2700, 2400, 1000] as const

export const GENESIS_REQUIRED_PERSONAS = ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend'] as const
