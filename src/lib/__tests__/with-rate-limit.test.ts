import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '../rate-limit'
import { retryAfterSeconds, withRateLimit } from '../with-rate-limit'

jest.mock('../rate-limit', () => ({
  checkRateLimit: jest.fn(),
  checkSimpleRateLimit: jest.fn(),
}))

const mockCheck = checkRateLimit as unknown as jest.Mock
const request = { url: 'https://example.com/api/bargain/offer' } as NextRequest

const now = 1_800_000_000_000

describe('retryAfterSeconds', () => {
  it('converts an absolute reset timestamp into seconds until retry', () => {
    expect(retryAfterSeconds(now + 5_000, now)).toBe(5)
    expect(retryAfterSeconds(now + 1_500, now)).toBe(2)
  })

  it('never emits zero, negative, or non-finite seconds', () => {
    expect(retryAfterSeconds(now - 10_000, now)).toBe(1)
    expect(retryAfterSeconds(now, now)).toBe(1)
    expect(retryAfterSeconds(0, now)).toBe(1)
    expect(retryAfterSeconds(Number.NaN, now)).toBe(1)
    expect(retryAfterSeconds(now + 5_000, Number.NaN)).toBe(1)
  })
})

describe('withRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends a short numeric Retry-After on throttled responses', async () => {
    mockCheck.mockResolvedValue({ success: false, remaining: 0, resetTime: Date.now() + 6_500 })

    const response = await withRateLimit(request, async () => NextResponse.json({ ok: true }), { maxAttempts: 5 })

    expect(response.status).toBe(429)
    const retryAfter = Number(response.headers.get('Retry-After'))
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThanOrEqual(6)
    expect(retryAfter).toBeLessThanOrEqual(7)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('does not add Retry-After to successful responses', async () => {
    mockCheck.mockResolvedValue({ success: true, remaining: 7, resetTime: Date.now() + 60_000 })

    const response = await withRateLimit(request, async () => NextResponse.json({ ok: true }), { maxAttempts: 10 })

    expect(response.status).toBe(200)
    expect(response.headers.get('Retry-After')).toBeNull()
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('7')
  })
})
