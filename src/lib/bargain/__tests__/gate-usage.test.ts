// Regression tests for bargain quota resolution.
//
// The allowance must be measured PER STORE from real session rows, not from the
// shared Subscription counters — a stale/shared counter made a store with zero
// activity read "used up". Free/pending plans must meter the current calendar
// month so the allowance actually resets; paid plans meter their billing period.
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findUnique: jest.fn() },
    subscription: { findFirst: jest.fn(), create: jest.fn() },
    bargainSession: { count: jest.fn() },
  },
}))

import prisma from '@/lib/db'
import { getBargainGate } from '../gate'
import { PLANS } from '@/lib/payment'

const mockPrisma = prisma as unknown as {
  store: { findUnique: jest.Mock }
  subscription: { findFirst: jest.Mock; create: jest.Mock }
  bargainSession: { count: jest.Mock }
}

function freeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    userId: 'user_1',
    plan: 'free',
    status: 'active',
    overageEnabled: true,
    bargainSessionsUsed: 999,
    bargainDealsUsed: 999,
    currentPeriodStart: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.store.findUnique.mockResolvedValue({ userId: 'user_1' })
  mockPrisma.subscription.findFirst.mockResolvedValue(freeSubscription())
  mockPrisma.subscription.create.mockResolvedValue(freeSubscription())
  mockPrisma.bargainSession.count.mockResolvedValue(0)
})

describe('getBargainGate usage metering', () => {
  test('ignores the stale subscription counter — a fresh store is not exhausted', async () => {
    const gate = await getBargainGate('store_b')
    expect(gate.sessionsUsed).toBe(0)
    expect(gate.dealsUsed).toBe(0)
    expect(gate.sessionsExhausted).toBe(false)
    expect(gate.dealsExhausted).toBe(false)
    expect(gate.sessionsRemaining).toBe(PLANS.FREE.bargainSessions)
  })

  test('free plans meter the current calendar month (allowance resets monthly)', async () => {
    await getBargainGate('store_b')
    const now = new Date()
    const expectedStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const call = mockPrisma.bargainSession.count.mock.calls[0][0]
    expect(call.where.storeId).toBe('store_b')
    expect(call.where.startedAt.gte.toISOString()).toBe(expectedStart.toISOString())
  })

  test('paid plans meter within their billing period', async () => {
    const periodStart = new Date('2025-06-15T00:00:00Z')
    mockPrisma.subscription.findFirst.mockResolvedValue(
      freeSubscription({ plan: 'growth', status: 'active', currentPeriodStart: periodStart }),
    )
    await getBargainGate('store_a')
    const call = mockPrisma.bargainSession.count.mock.calls[0][0]
    expect(call.where.startedAt.gte).toBe(periodStart)
  })

  test('counting is scoped to the requested store', async () => {
    mockPrisma.bargainSession.count.mockResolvedValue(5)
    const gate = await getBargainGate('store_x')
    expect(mockPrisma.bargainSession.count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ storeId: 'store_x' }) }),
    )
    expect(gate.sessionsUsed).toBe(5)
  })

  test('pending paid plans fall back to free limits and monthly usage', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue(
      freeSubscription({ plan: 'growth', status: 'pending', bargainSessionsUsed: 300 }),
    )
    const gate = await getBargainGate('store_b')
    expect(gate.planId).toBe('free')
    expect(gate.isPaid).toBe(false)
    expect(gate.sessionsExhausted).toBe(false)
  })

  test('exhaustion reflects real usage against the plan limit', async () => {
    mockPrisma.bargainSession.count.mockResolvedValue(PLANS.FREE.bargainSessions)
    const gate = await getBargainGate('store_b')
    expect(gate.sessionsExhausted).toBe(true)
    expect(gate.sessionsRemaining).toBe(0)
  })
})
