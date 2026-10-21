/**
 * @jest-environment node
 *
 * Regression tests for order-webhook deduplication during a Redis outage.
 *
 * Fault: isDuplicateOrder returned `!redisSetNX(...)`. redisSetNX() returns
 * false BOTH when the key already exists (a real duplicate) AND when Redis is
 * unreachable. During any Redis outage every orders/create delivery was
 * therefore classified as a duplicate and dropped before processing — silently
 * losing ALL order/recovery attribution.
 *
 * Fix: use redisSetNXOrNull() to tell "Redis unusable" (null) apart from a real
 * claim, and treat only an explicit already-held key (false) as a duplicate.
 * Reprocessing a genuine duplicate is safe because processOrderCreate guards
 * with its own shopifyOrderId / RecoveredCart unique constraint.
 */
import { isDuplicateOrder } from '@/lib/order-dedup'
import { redisSetNXOrNull } from '@/lib/redis'

jest.mock('@/lib/redis', () => ({ redisSetNX: jest.fn(), redisSetNXOrNull: jest.fn() }))

const setMock = redisSetNXOrNull as jest.Mock

describe('isDuplicateOrder — Redis outage must not drop orders', () => {
  it('treats a Redis outage (null claim) as NOT a duplicate', async () => {
    setMock.mockResolvedValue(null)
    await expect(isDuplicateOrder('order-1')).resolves.toBe(false)
  })

  it('treats a freshly acquired claim (true) as NOT a duplicate', async () => {
    setMock.mockResolvedValue(true)
    await expect(isDuplicateOrder('order-1')).resolves.toBe(false)
  })

  it('treats an already-held claim (false) as a duplicate', async () => {
    setMock.mockResolvedValue(false)
    await expect(isDuplicateOrder('order-1')).resolves.toBe(true)
  })

  it('scopes the dedupe key to the store', async () => {
    // Shopify order ids are per-shop sequences: a global key made store B's
    // order #1001 look like a replay of store A's order #1001 and dropped a
    // real order.
    setMock.mockResolvedValue(true)
    await isDuplicateOrder('1001', 'store-a')
    await isDuplicateOrder('1001', 'store-b')
    const keys = setMock.mock.calls.map((c) => c[0])
    expect(keys).toContain('dedup:order:store-a:1001')
    expect(keys).toContain('dedup:order:store-b:1001')
    // The store-scoped keys are distinct, so a duplicate order id in another
    // store cannot be swallowed.
    expect(keys.filter((k) => k.includes('1001'))).toHaveLength(2)
  })
})
