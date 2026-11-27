export { buildTrendPromptBlock, getBargainTrendPrompt, refreshBargainTrends, trendCacheKey } from './service'
export {
  inferTrendTopics,
  resolveTrendTopics,
  sanitizeTrendConfig,
  TREND_TOPIC_CATALOG,
  TREND_TOPIC_IDS,
} from './catalog'
export {
  configuredTrendProviderId,
  DEFAULT_TREND_PROVIDER_ID,
  getTrendProvider,
  registerTrendProvider,
  registeredTrendProviderIds,
} from './providers'
export { clearTrendCacheForTests, readTrendCache, writeTrendCache } from './cache'
export { wikimediaTrendProvider } from './wikimedia'
export type {
  TrendCache,
  TrendDirection,
  TrendFetchInput,
  TrendMerchantConfig,
  TrendProductInput,
  TrendProvider,
  TrendRegion,
  TrendSignal,
  TrendTopic,
} from './types'
