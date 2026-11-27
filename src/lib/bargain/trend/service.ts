import prisma from '@/lib/db'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { resolveTrendTopics, sanitizeTrendConfig } from './catalog'
import { readTrendCache, writeTrendCache } from './cache'
import { getTrendProvider, configuredTrendProviderId } from './providers'
import {
  TREND_CACHE_TTL_MS,
  TREND_CACHE_VERSION,
  type TrendCache,
  type TrendMerchantConfig,
  type TrendProductInput,
  type TrendRegion,
  type TrendSignal,
} from './types'

export function trendCacheKey(storeId: string): string {
  return `bargain:trend:${TREND_CACHE_VERSION}:${storeId}`
}

function sourceLabel(signal: TrendSignal): string {
  if (signal.source === 'wikimedia_pageviews') return 'Wikimedia public data'
  return `${signal.source} public-interest data`
}

function signalLine(signal: TrendSignal): string {
  const change = signal.changePercent
  const direction = signal.direction === 'up'
    ? `up ${Math.abs(change ?? 0)}%`
    : signal.direction === 'down'
      ? `down ${Math.abs(change ?? 0)}%`
      : 'broadly steady'
  const locale = signal.locale ? `, ${signal.locale} edition` : ''
  return `- ${signal.label}: public page-view interest was ${direction} over the 14 days ending ${signal.windowEnd} (${sourceLabel(signal)}${locale}).`
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
    ? 'A light, tasteful reference is allowed only when the shopper already cares about the topic; never force a joke, meme or punchline.'
    : 'Keep the tone neutral and factual; do not use memes, slang or jokes.'

  return [
    'TREND INTELLIGENCE (internal; optional conversation context only):',
    ...signals.map(signalLine),
    `Source scope: cached public-interest page-view data for region ${cache.region}, refreshed ${cache.refreshedAt.slice(0, 10)}. It is not local demand, store sales, inventory, price evidence or a verified popularity claim about this product.`,
    `Use only as subtle context when genuinely relevant to the shopper's stated interest. Never mention a specific event. Never say viral, trending nearby, selling fast or customers are buying it, and never use it to justify a discount. ${tone}`,
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
  provider: string
  stores: number
  signals: number
  skipped: number
}> {
  const providerId = configuredTrendProviderId()
  if (!isFeatureEnabled('BARGAIN_TREND_INTELLIGENCE')) {
    return { enabled: false, provider: providerId, stores: 0, signals: 0, skipped: 0 }
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

  const provider = getTrendProvider(providerId)
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
      const fetched = await provider.fetchSignals({ topicIds: topics, region: sanitized.region as TrendRegion, now })
      const valid = fetched.filter((signal) => signal.direction !== 'insufficient')
      const cache: TrendCache = {
        version: TREND_CACHE_VERSION,
        region: sanitized.region as TrendRegion,
        signals: valid,
        refreshedAt: now.toISOString(),
      }
      await writeTrendCache(trendCacheKey(config.storeId), cache, TREND_CACHE_TTL_MS)
      stores += 1
      signals += valid.length
    } catch {
      skipped += 1
    }
  }

  return { enabled: true, provider: provider.id, stores, signals, skipped }
}
