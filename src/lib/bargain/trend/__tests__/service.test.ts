jest.mock('@/lib/feature-flags', () => ({
  isFeatureEnabled: jest.fn(),
}))

jest.mock('@/lib/redis', () => ({
  redisGet: jest.fn(),
  redisSet: jest.fn(),
}))

import { isFeatureEnabled } from '@/lib/feature-flags'
import { redisGet, redisSet } from '@/lib/redis'
import { clearTrendCacheForTests } from '../cache'
import { getBargainTrendPrompt } from '../service'
import type { TrendCache } from '../types'

const cache: TrendCache = {
  version: 1,
  region: 'US',
  refreshedAt: '2026-11-24T03:30:00.000Z',
  signals: [{
    topicId: 'fitness',
    label: 'fitness',
    source: 'wikimedia_pageviews',
    sourceUrl: 'https://wikimedia.org/example',
    article: 'Physical_fitness',
    windowStart: '2026-11-10',
    windowEnd: '2026-11-23',
    recentViews: 1000,
    previousViews: 800,
    changePercent: 25,
    direction: 'up',
    refreshedAt: '2026-11-24T03:30:00.000Z',
  }],
}

const config = {
  trendIntelligenceEnabled: true,
  trendRegion: 'US',
  trendTopics: ['fitness'],
  trendExcludedTopics: [],
  trendHumorEnabled: false,
}

describe('getBargainTrendPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearTrendCacheForTests()
    jest.spyOn(global, 'fetch')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does no cache or network work when the server flag is off', async () => {
    ;(isFeatureEnabled as jest.Mock).mockReturnValue(false)
    const prompt = await getBargainTrendPrompt({ storeId: 'store_1', config, product: null })
    expect(prompt).toBe('')
    expect(redisGet).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does no cache or network work when the merchant has not opted in', async () => {
    ;(isFeatureEnabled as jest.Mock).mockReturnValue(true)
    const prompt = await getBargainTrendPrompt({
      storeId: 'store_1',
      config: { ...config, trendIntelligenceEnabled: false },
      product: null,
    })
    expect(prompt).toBe('')
    expect(redisGet).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reads only the cached snapshot in the request path', async () => {
    ;(isFeatureEnabled as jest.Mock).mockReturnValue(true)
    ;(redisGet as jest.Mock).mockResolvedValue(JSON.stringify(cache))

    const prompt = await getBargainTrendPrompt({ storeId: 'store_1', config, product: null })
    expect(prompt).toContain('TREND INTELLIGENCE')
    expect(redisGet).toHaveBeenCalledWith('bargain:trend:1:store_1')
    expect(redisSet).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
