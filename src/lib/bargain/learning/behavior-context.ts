import type { SocialSignals } from '../behavior'
import type { IntentAnalysis } from '../intent'
import type { LiveTurnAnalysis } from '../live-turn'
import type { SessionMemory } from '../session-memory'

export const BEHAVIOR_GROUPS = [
  'price_focused',
  'value_seeker',
  'curious',
  'hesitant',
  'playful',
  'frustrated',
  'hostile',
  'social',
  'chaotic',
  'ready',
  'exit_risk',
  'neutral',
] as const

export type BehaviorGroup = (typeof BEHAVIOR_GROUPS)[number]

export const TREND_BUCKETS = [
  'regular',
  'festive',
  'wedding',
  'summer',
  'monsoon',
  'year_end',
] as const

export type TrendBucket = (typeof TREND_BUCKETS)[number]

export interface AdaptiveContext {
  behavior: BehaviorGroup
  trend: string
  liveTurnMode: string
  emojiBudget: 0 | 1
  humorAllowed: boolean
}

export interface AdaptiveContextInput {
  liveTurn?: LiveTurnAnalysis | null
  intent?: IntentAnalysis | null
  signals?: SocialSignals | null
  memory?: SessionMemory | null
  now?: Date
}

function behaviorFromMode(mode: string): BehaviorGroup | null {
  switch (mode) {
    case 'insult': return 'hostile'
    case 'frustrated': return 'frustrated'
    case 'walkout': return 'exit_risk'
    case 'purchase': return 'ready'
    case 'hesitation': return 'hesitant'
    case 'question': return 'curious'
    case 'playful':
    case 'joke':
    case 'flattery':
    case 'emoji_only': return 'playful'
    case 'greeting':
    case 'small_talk': return 'social'
    case 'nonsense':
    case 'off_topic':
    case 'probe':
    case 'reask': return 'chaotic'
    case 'price': return 'price_focused'
    default: return null
  }
}

function behaviorFromIntent(intent?: IntentAnalysis | null): BehaviorGroup | null {
  if (!intent) return null
  switch (intent.intent) {
    case 'WALKOUT': return 'exit_risk'
    case 'PURCHASE_READY': return 'ready'
    case 'PURCHASE_HESITATION': return 'hesitant'
    case 'PRODUCT_QUESTION':
    case 'PRODUCT_DISCOVERY': return 'curious'
    case 'RECOMMENDATION_REQUEST':
    case 'PRODUCT_MISMATCH': return 'value_seeker'
    case 'VALUE_UNCLEAR':
    case 'COMPARISON': return 'value_seeker'
    case 'PRICE_ONLY':
    case 'BUDGET_CONSTRAINT': return 'price_focused'
    case 'GENERIC_CHAT': return 'social'
    default: return null
  }
}

export function behaviorGroupForTurn(input: AdaptiveContextInput): BehaviorGroup {
  const fromMode = behaviorFromMode(input.liveTurn?.mode ?? '')
  if (fromMode) return fromMode
  if (input.signals?.emotion === 'frustrated') return 'frustrated'
  if (input.signals?.emotion === 'playful' || input.signals?.emotion === 'excited') return 'playful'
  if (input.memory?.seriousness === 'time_waster') return 'chaotic'
  const fromIntent = behaviorFromIntent(input.intent)
  if (fromIntent) return fromIntent
  if (input.memory?.nextMove.includes('verified')) return 'value_seeker'
  return 'neutral'
}

export function trendBucketForDate(now: Date = new Date()): string {
  const month = now.getMonth()
  const quarter = Math.floor(month / 3) + 1
  let season: TrendBucket = 'regular'
  if (month === 9 || month === 10) season = 'festive'
  else if (month === 11) season = 'year_end'
  else if (month === 0 || month === 1) season = 'wedding'
  else if (month === 4 || month === 5) season = 'summer'
  else if (month === 6 || month === 7) season = 'monsoon'
  const weekday = now.getDay()
  const dayType = weekday === 0 || weekday === 6 ? 'weekend' : 'weekday'
  return `${season}-q${quarter}-${dayType}`
}

export function adaptiveContextForTurn(input: AdaptiveContextInput): AdaptiveContext {
  return {
    behavior: behaviorGroupForTurn(input),
    trend: trendBucketForDate(input.now ?? new Date()),
    liveTurnMode: input.liveTurn?.mode ?? 'ordinary',
    emojiBudget: input.liveTurn?.emojiBudget ?? 0,
    humorAllowed: input.liveTurn?.humorAllowed ?? false,
  }
}

const TREND_BUCKET_RE = /^(regular|festive|wedding|summer|monsoon|year_end)-q[1-4]-(weekday|weekend)$/
const BEHAVIOR_SET: ReadonlySet<string> = new Set(BEHAVIOR_GROUPS)

export function normalizedBehavior(value?: string | null): BehaviorGroup | null {
  return value && BEHAVIOR_SET.has(value) ? (value as BehaviorGroup) : null
}

export function normalizedTrend(value?: string | null): string | null {
  return value && TREND_BUCKET_RE.test(value) ? value : null
}

export function adaptivePromptBlock(context?: AdaptiveContext | null): string {
  if (!context) return ''
  return [
    `ADAPTIVE READ (internal; never mention these labels): shopper behavior=${context.behavior}; calendar bucket=${context.trend}.`,
    'Use it only to choose warmth, pace and follow-up style. Never invent a trend, event or claim from these labels.',
  ].join(' ')
}
