import prisma from '@/lib/db'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { resolveTrendTopics, sanitizeTrendConfig } from './catalog'
import { readTrendCache, writeTrendCache } from './cache'
import { fetchTrendSignals } from './wikimedia'
import {
  TREND_CACHE_TTL_MS,
  TREND_CACHE_VERSION,
  type TrendCache,
  type TrendMerchantConfig,
  type TrendProductInput,
  type TrendSignal,
} from './types'

export function trendCacheKey(storeId: string): string {
  return `bargain:trend:${TREND_CACHE_VERSION}:${storeId}`
}

function directionPhrase(signal: TrendSignal): string {
  if (signal.direction === 'up') return `up ${Math.abs(signal.changePercent ?? 0)}%`
  if (signal.direction === 'down') return `down ${Math.abs(signal.changePercent ?? 0)}%`
  return 'broadly steady'
}

function signalLine(signal: TrendSignal): string {
  const date = signal.windowEnd
  return `- ${signal.label}: public page views were ${directionPhrase(signal)} over the 14 days ending ${date} (Wikimedia public data).`
}

export function buildTrendPromptBlock(
  cache: TrendCache | null,
  config: TrendMerchantConfig | null | undefined,
  product: TrendProductInput | null | undefined,
): string {
  const sanitized = sanitizeTrendConfig(config)
  if (!sanitized.enabled || !cache || cache.region !== sanitized.region) return ''

  const selected = new Set(resolveTrendTopics(sanitized, product))
  const signals = cache.signals
    .filter((signal) => selected.has(signal.topicId) && signal.direction !== 'insufficient')
    .slice(0, 3)
  if (signals.length === 0) return ''

  const tone = sanitized.humorEnabled
    ? 'A light, tasteful reference is allowed when the shopper already cares about the topic; never force a joke or meme.'
    : 'Keep the tone neutral and factual; do not use memes, slang or jokes.'

  return [
    'TREND INTELLIGENCE (internal; optional conversation context only):',
    ...signals.map(signalLine),
    `Source scope: global English-language Wikimedia page-view data refreshed ${cache.refreshedAt.slice(0, 10)}. It is not local demand, store sales, inventory, price evidence or a popularity claim about this product.`,
    `Use only as subtle context when genuinely relevant to the shopper's stated interest. Never say viral, trending nearby, selling fast, customers are buying it, or use it to justify a discount. ${tone}`,
  ].join('\n').slice(0, 1000)
}

export async function getBargainTrendPrompt(input: {
  storeId: string
  config: TrendMerchantConfig | null | undefined
  product: TrendProductInput | null | undefined
}): Promise<string> {
  if (!isFeatureEnabled('BARGAIN_TREND_INTELLIGENCE')) return ''
  const config = sanitizeTrendConfig(input.config)
  if (!config.enabled) return ''
  const cache = await readTrendCache(trendCacheKey(input.storeId))
  return buildTrendPromptBlock(cache, config, input.product)
}

export async function refreshBargainTrends(now: Date = new Date()): Promise<{
  enabled: boolean
  stores: number
  signals: number
  skipped: number
}> {
  if (!isFeatureEnabled('BARGAIN_TREND_INTELLIGENCE')) {
    return { enabled: false, stores: 0, signals: 0, skipped: 0 }
  }

  const configs: Array<TrendMerchantConfig & { storeId: string }> = await (prisma.bargainConfig as any).findMany({
    where: { enabled: true, trendIntelligenceEnabled: true },
    select: {
      storeId: true,
      trendRegion: true,
      trendTopics: true,
      trendExcludedTopics: true,
      trendHumorEnabled: true,
    },
  })

  let stores = 0
  let signals = 0
  let skipped = 0

  for (const config of configs) {
    const sanitized = sanitizeTrendConfig(config)
    const topics = resolveTrendTopics(sanitized, null)
    if (topics.length === 0) {
      skipped += 1
      continue
    }

    try {
      const fetched = await fetchTrendSignals(topics, sanitized.region, now)
      const cache: TrendCache = {
        version: TREND_CACHE_VERSION,
        region: sanitized.region,
        signals: fetched,
        refreshedAt: now.toISOString(),
      }
      await writeTrendCache(trendCacheKey(config.storeId), cache, TREND_CACHE_TTL_MS)
      stores += 1
      signals += fetched.length
    } catch {
      skipped += 1
    }
  }

  return { enabled: true, stores, signals, skipped }
}
