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
  'pop_culture_references',
  'fictional_characters',
  'sports_gaming_references',
  'memes_internet_culture',
  'sarcasm_irony',
  'random_statements',
  'emotional_intelligence',
  'category_specific_selling',
  'competitor_comparisons',
  'bundle_upsell_intelligence',
  'multilingual_conversations',
  'checkout_closure',
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
  pop_culture_references: 'pop culture references',
  fictional_characters: 'fictional characters',
  sports_gaming_references: 'sports/gaming references',
  memes_internet_culture: 'memes/internet culture',
  sarcasm_irony: 'sarcasm/irony',
  random_statements: 'random statements',
  emotional_intelligence: 'emotional intelligence',
  category_specific_selling: 'category-specific selling',
  competitor_comparisons: 'competitor comparisons',
  bundle_upsell_intelligence: 'bundle/upsell intelligence',
  multilingual_conversations: 'multilingual conversations',
  checkout_closure: 'checkout closure',
}

export const GENESIS_CATEGORY_WEIGHTS: Record<GenesisCategory, number> = {
  serious_bargain_hunters: 6,
  difficult_customers: 6,
  customer_psychology: 5,
  salesperson_intelligence: 6,
  humor_personality: 4,
  social_trend_references: 3,
  upselling_cross_selling: 5,
  price_floor_protection: 16,
  multi_turn_negotiation: 8,
  weird_scenarios: 5,
  speed_reliability: 4,
  ultimate_conversion_challenge: 4,
  pop_culture_references: 3,
  fictional_characters: 3,
  sports_gaming_references: 2,
  memes_internet_culture: 2,
  sarcasm_irony: 2,
  random_statements: 2,
  emotional_intelligence: 3,
  category_specific_selling: 3,
  competitor_comparisons: 2,
  bundle_upsell_intelligence: 2,
  multilingual_conversations: 2,
  checkout_closure: 2,
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
  'pop_culture_references',
  'fictional_characters',
  'sports_gaming_references',
  'memes_internet_culture',
  'sarcasm_irony',
  'random_statements',
  'emotional_intelligence',
  'category_specific_selling',
  'competitor_comparisons',
  'bundle_upsell_intelligence',
  'multilingual_conversations',
  'checkout_closure',
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
