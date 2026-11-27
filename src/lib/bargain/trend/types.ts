export type TrendDirection = 'up' | 'down' | 'flat' | 'insufficient'

export const TREND_REGION_VALUES = [
  'US', 'GB', 'CA', 'AU', 'IN', 'DE', 'FR', 'ES', 'IT', 'PT', 'BR', 'JP',
] as const

export type TrendRegion = (typeof TREND_REGION_VALUES)[number]

export interface TrendTopic {
  id: string
  label: string
  article: string
  articles?: Partial<Record<TrendRegion, string>>
  keywords: string[]
  sensitive?: boolean
}

export interface TrendSignal {
  topicId: string
  label: string
  source: string
  sourceUrl: string
  article: string
  windowStart: string
  windowEnd: string
  recentViews: number
  previousViews: number
  changePercent: number | null
  direction: TrendDirection
  region?: TrendRegion
  locale?: string
  localized?: boolean
  refreshedAt: string
}

export interface TrendCache {
  version: 1
  region: TrendRegion
  signals: TrendSignal[]
  refreshedAt: string
}

export interface TrendMerchantConfig {
  enabled?: boolean
  region?: string
  topics?: string[]
  excludedTopics?: string[]
  humorEnabled?: boolean
  trendIntelligenceEnabled?: boolean
  trendRegion?: string | null
  trendTopics?: string[] | null
  trendExcludedTopics?: string[] | null
  trendHumorEnabled?: boolean
}

export interface TrendProductInput {
  title?: string | null
  productType?: string | null
  tags?: string[] | null
}

export interface TrendFetchInput {
  topicIds: string[]
  region: TrendRegion
  now: Date
}

export interface TrendProvider {
  id: string
  fetchSignals(input: TrendFetchInput): Promise<TrendSignal[]>
}

export const TREND_CACHE_VERSION = 1
export const TREND_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDirection(value: unknown): value is TrendDirection {
  return value === 'up' || value === 'down' || value === 'flat' || value === 'insufficient'
}

export function isTrendRegion(value: unknown): value is TrendRegion {
  return typeof value === 'string' && (TREND_REGION_VALUES as readonly string[]).includes(value)
}

export function isTrendCache(value: unknown): value is TrendCache {
  if (!isRecord(value)) return false
  if (value.version !== TREND_CACHE_VERSION) return false
  if (!isTrendRegion(value.region)) return false
  if (typeof value.refreshedAt !== 'string') return false
  if (!Array.isArray(value.signals) || value.signals.length > 8) return false
  return value.signals.every((signal) => {
    if (!isRecord(signal)) return false
    return typeof signal.topicId === 'string'
      && typeof signal.label === 'string'
      && typeof signal.source === 'string'
      && typeof signal.sourceUrl === 'string'
      && typeof signal.article === 'string'
      && typeof signal.windowStart === 'string'
      && typeof signal.windowEnd === 'string'
      && isFiniteNumber(signal.recentViews)
      && isFiniteNumber(signal.previousViews)
      && (signal.changePercent === null || isFiniteNumber(signal.changePercent))
      && isDirection(signal.direction)
      && (signal.region === undefined || isTrendRegion(signal.region))
      && (signal.locale === undefined || typeof signal.locale === 'string')
      && (signal.localized === undefined || typeof signal.localized === 'boolean')
      && typeof signal.refreshedAt === 'string'
  })
}
