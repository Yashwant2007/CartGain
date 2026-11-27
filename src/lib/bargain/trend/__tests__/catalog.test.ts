import { inferTrendTopics, resolveTrendTopics, sanitizeTrendConfig } from '../catalog'
import { buildTrendPromptBlock } from '../service'
import { isTrendCache, type TrendCache } from '../types'

const cache: TrendCache = {
  version: 1,
  region: 'US',
  refreshedAt: '2026-11-24T03:30:00.000Z',
  signals: [
    {
      topicId: 'fitness',
      label: 'fitness',
      source: 'wikimedia_pageviews',
      sourceUrl: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Physical_fitness/daily/20261110/20261123',
      article: 'Physical_fitness',
      windowStart: '2026-11-10',
      windowEnd: '2026-11-23',
      recentViews: 1000,
      previousViews: 800,
      changePercent: 25,
      direction: 'up',
      refreshedAt: '2026-11-24T03:30:00.000Z',
    },
  ],
}

describe('bargain trend catalog', () => {
  it('sanitizes merchant topics to the curated allow-list', () => {
    const config = sanitizeTrendConfig({
      trendIntelligenceEnabled: true,
      trendRegion: 'invalid',
      trendTopics: ['fitness', 'not-real', 'fitness', ' wellness '],
      trendExcludedTopics: ['politics'],
      trendHumorEnabled: true,
    })
    expect(config.enabled).toBe(true)
    expect(config.region).toBe('US')
    expect(config.topics).toEqual(['fitness', 'wellness'])
    expect(config.excludedTopics).toEqual([])
    expect(config.humorEnabled).toBe(true)
  })

  it('infers safe topics from product metadata', () => {
    expect(inferTrendTopics({ title: 'Trail Running Shoes', productType: 'Footwear', tags: ['gym', 'outdoor'] }))
      .toEqual(expect.arrayContaining(['sneakers', 'fitness', 'camping']))
  })

  it('removes excluded topics even when explicitly configured', () => {
    const config = sanitizeTrendConfig({
      trendTopics: ['fitness', 'gaming'],
      trendExcludedTopics: ['fitness'],
    })
    expect(resolveTrendTopics(config, null)).toEqual(['gaming'])
  })

  it('accepts cached signals whose view change could not be calculated', () => {
    const entry = {
      ...cache,
      signals: [{ ...cache.signals[0], changePercent: null, direction: 'insufficient' }],
    }
    expect(isTrendCache(entry)).toBe(true)
  })
})

describe('buildTrendPromptBlock', () => {
  const config = sanitizeTrendConfig({
    trendIntelligenceEnabled: true,
    trendTopics: ['fitness'],
    trendRegion: 'US',
  })

  it('returns empty prompt when the feature is disabled or the cache is missing', () => {
    expect(buildTrendPromptBlock(cache, { ...config, enabled: false }, null)).toBe('')
    expect(buildTrendPromptBlock(null, config, null)).toBe('')
  })

  it('adds bounded, source-tagged context with explicit claim limits', () => {
    const prompt = buildTrendPromptBlock(cache, config, null)
    expect(prompt).toContain('Wikimedia public data')
    expect(prompt).toContain('not local demand')
    expect(prompt).toContain('Never say viral')
    expect(prompt).toContain('do not use memes')
    expect(prompt.length).toBeLessThanOrEqual(1000)
  })

  it('uses a neutral tone only when humor is enabled for a tasteful reference', () => {
    const prompt = buildTrendPromptBlock(cache, { ...config, humorEnabled: true }, null)
    expect(prompt).toContain('light, tasteful reference')
  })

  it('never exposes topic signals the merchant did not allow', () => {
    const prompt = buildTrendPromptBlock(cache, sanitizeTrendConfig({ trendIntelligenceEnabled: true, trendTopics: ['gaming'] }), null)
    expect(prompt).toBe('')
  })
})
