import {
  configuredTrendProviderId,
  DEFAULT_TREND_PROVIDER_ID,
  getTrendProvider,
  registerTrendProvider,
  registeredTrendProviderIds,
} from '../providers'
import type { TrendProvider } from '../types'

describe('trend provider registry', () => {
  const original = process.env.BARGAIN_TREND_PROVIDER

  afterEach(() => {
    if (original === undefined) delete process.env.BARGAIN_TREND_PROVIDER
    else process.env.BARGAIN_TREND_PROVIDER = original
  })

  it('defaults to the official Wikimedia provider', () => {
    delete process.env.BARGAIN_TREND_PROVIDER
    expect(DEFAULT_TREND_PROVIDER_ID).toBe('wikimedia_pageviews')
    expect(configuredTrendProviderId()).toBe('wikimedia_pageviews')
    expect(getTrendProvider().id).toBe('wikimedia_pageviews')
  })

  it('accepts a configured provider and falls back when unknown', () => {
    process.env.BARGAIN_TREND_PROVIDER = '  custom_public_data  '
    expect(configuredTrendProviderId()).toBe('custom_public_data')
    expect(getTrendProvider().id).toBe('wikimedia_pageviews')
  })

  it('registers an additional provider without replacing the default', () => {
    const provider: TrendProvider = {
      id: `test_provider_${Date.now()}`,
      fetchSignals: async () => [],
    }
    registerTrendProvider(provider)
    expect(getTrendProvider(provider.id)).toBe(provider)
    expect(registeredTrendProviderIds()).toContain(provider.id)
    expect(getTrendProvider('wikimedia_pageviews').id).toBe('wikimedia_pageviews')
  })
})
