import { headers } from 'next/headers'
import { redisIncrOrNull, redisExpire } from '@/lib/redis'
import { checkRateLimit } from '@/lib/rate-limit'

jest.mock('next/headers', () => ({ headers: jest.fn() }))
jest.mock('@/lib/redis', () => ({
  redisIncrOrNull: jest.fn(),
  redisExpire: jest.fn(),
}))

const mockHeaders = headers as unknown as jest.Mock
const mockIncr = redisIncrOrNull as unknown as jest.Mock
const mockExpire = redisExpire as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockHeaders.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7' }))
})

describe('checkRateLimit', () => {
  it('falls back to the in-memory limiter (does NOT fail open) when Redis is unavailable', async () => {
    // Regression: redisIncr used to return 0 when Redis was down, so the
    // in-memory fallback never ran and auth endpoints were effectively
    // unprotected. redisIncrOrNull now returns null to trigger the fallback.
    mockIncr.mockResolvedValue(null)
    const endpoint = `fail-open-regression-${Date.now()}`

    let last = await checkRateLimit(endpoint, { maxAttempts: 3, windowMs: 60_000 })
    for (let i = 0; i < 4; i++) {
      last = await checkRateLimit(endpoint, { maxAttempts: 3, windowMs: 60_000 })
    }
    expect(last.success).toBe(false)
  })

  it('uses Redis when healthy and sets the TTL in milliseconds', async () => {
    mockIncr.mockResolvedValueOnce(1)
    const endpoint = `redis-ms-${Date.now()}`
    const windowMs = 15 * 60 * 1000

    const result = await checkRateLimit(endpoint, { maxAttempts: 10, windowMs })

    expect(result.success).toBe(true)
    expect(mockExpire).toHaveBeenCalledWith(`ratelimit:203.0.113.7_${endpoint}`, windowMs)
  })

  it('blocks once the Redis counter exceeds maxAttempts', async () => {
    mockIncr.mockResolvedValue(11)
    const result = await checkRateLimit(`redis-block-${Date.now()}`, { maxAttempts: 10 })
    expect(result.success).toBe(false)
  })
})
