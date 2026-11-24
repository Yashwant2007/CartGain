export type TrendDirection = 'up' | 'down' | 'flat' | 'insufficient'

export interface TrendTopic {
  id: string
  label: string
  article: string
  keywords: string[]
  sensitive?: boolean
}

export interface TrendSignal {
  topicId: string
  label: string
  source: 'wikimedia_pageviews'
  sourceUrl: string
  article: string
  windowStart: string
  windowEnd: string
  recentViews: number
  previousViews: number
  changePercent: number | null
  direction: TrendDirection
  refreshedAt: string
}

export interface TrendCache {
  version: 1
  region: string
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

export const TREND_CACHE_VERSION = 1
export const TREND_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function isTrendCache(value: unknown): value is TrendCache {
  if (!value || typeof value !== 'object') return false
  const cache = value as Partial<TrendCache>
  return cache.version === TREND_CACHE_VERSION
    && typeof cache.region === 'string'
    && typeof cache.refreshedAt === 'string'
    && Array.isArray(cache.signals)
    && cache.signals.every((signal) => signal
      && typeof signal.topicId === 'string'
      && typeof signal.label === 'string'
      && typeof signal.sourceUrl === 'string'
      && typeof signal.changePercent === 'number'
      && ['up', 'down', 'flat', 'insufficient'].includes(signal.direction))
}
