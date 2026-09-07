import { isTierTripped, tripTierBreaker, shouldLogQuota, isInsufficientQuotaError, resetQuotaBreakForTests } from '../ai-quota'

describe('AI quota circuit breakers', () => {
  beforeEach(() => {
    resetQuotaBreakForTests()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-09-07T10:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('isInsufficientQuotaError', () => {
    it('detects OpenAI insufficient_quota errors', () => {
      expect(isInsufficientQuotaError({ status: 429, code: 'insufficient_quota' })).toBe(true)
      expect(isInsufficientQuotaError({ statusCode: 402 })).toBe(true)
      expect(isInsufficientQuotaError({ status: 402, error: { code: 'insufficient_quota' } })).toBe(true)
    })

    it('does not misclassify transient rate limits or other errors', () => {
      expect(isInsufficientQuotaError({ status: 429, code: 'rate_limit_exceeded' })).toBe(false)
      expect(isInsufficientQuotaError({ status: 500 })).toBe(false)
      expect(isInsufficientQuotaError(undefined)).toBe(false)
    })
  })

  describe('tripTierBreaker / isTierTripped', () => {
    it('starts untripped for both tiers', () => {
      expect(isTierTripped('primary')).toBe(false)
      expect(isTierTripped('fallback')).toBe(false)
    })

    it('trips for a 15 minute window and recovers', () => {
      tripTierBreaker('primary')
      expect(isTierTripped('primary')).toBe(true)
      expect(isTierTripped('fallback')).toBe(false)
      jest.setSystemTime(Date.now() + 14 * 60_000)
      expect(isTierTripped('primary')).toBe(true)
      jest.setSystemTime(Date.now() + 2 * 60_000)
      expect(isTierTripped('primary')).toBe(false)
    })

    it('keeps the two tiers independent', () => {
      tripTierBreaker('fallback')
      expect(isTierTripped('fallback')).toBe(true)
      expect(isTierTripped('primary')).toBe(false)
    })

    it('does not extend the window on repeated trips', () => {
      tripTierBreaker('primary')
      jest.setSystemTime(Date.now() + 10 * 60_000)
      tripTierBreaker('primary')
      jest.setSystemTime(Date.now() + 10 * 60_000)
      expect(isTierTripped('primary')).toBe(false)
    })
  })

  describe('shouldLogQuota', () => {
    it('logs the first quota error, then stays quiet until the window expires', () => {
      expect(shouldLogQuota()).toBe(true)
      expect(shouldLogQuota()).toBe(false)
      jest.setSystemTime(Date.now() + 16 * 60_000)
      expect(shouldLogQuota()).toBe(true)
    })
  })
})