/**
 * @jest-environment node
 *
 * Regression tests for the Razorpay webhook dedup guard on SUBSCRIPTION
 * lifecycle events.
 *
 * Fault: every `subscription.*` event shares one subscription entity id, and
 * the dedup key was a bare `["subscription", subId]`. The first lifecycle event
 * (usually `subscription.activated`) claimed the webhookEvent ledger row; every
 * later transition (paused / halted / resumed / cancelled / completed) then hit
 * the unique(namespace, entityId) constraint, was treated as a redelivery and
 * acknowledged with a 200 — WITHOUT running its handler. A cancelled plan thus
 * stayed 'active' in the DB indefinitely.
 *
 * Fix: scope the dedup key by event type (`subscription.cancelled:<id>`), so
 * each distinct transition is its own delivery while true retries of the SAME
 * event are still deduped.
 */
import { POST } from '@/app/api/payments/webhook/route'
import prisma from '@/lib/db'

jest.mock('@/lib/payment', () => ({
  verifyWebhookSignature: jest.fn(() => true),
  PLANS: { pro: { id: 'pro', price: 999, smsCredits: 5000 } },
  resolvePlanId: jest.fn((p: string) => p),
  PAID_PLAN_IDS: ['pro'],
  getPlan: jest.fn(() => ({ id: 'pro', price: 999, smsCredits: 5000 })),
}))

// The ledger enforces @@unique([namespace, entityId]); emulate that here so a
// duplicate delivery throws P2002 exactly like Postgres would.
const ledger = new Set<string>()
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    webhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.namespace}:${data.entityId}`
        if (ledger.has(key)) {
          const e: any = new Error('unique constraint')
          e.code = 'P2002'
          throw e
        }
        ledger.add(key)
        return {}
      }),
    },
    subscription: { findFirst: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('@/lib/redis', () => ({ redisSetNX: jest.fn(async () => true) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn(async () => {}) }))

const prismaMock = prisma as any

function makeRequest(event: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return new Request('https://cart-gain.com/api/payment/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': 'sig',
      ...extraHeaders,
    },
    body: JSON.stringify(event),
  }) as any
}

function subscriptionEvent(name: string, id = 'sub_1') {
  return {
    event: name,
    payload: {
      subscription: {
        entity: {
          id,
          customer_id: 'cust_1',
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
        },
      },
    },
  }
}

beforeEach(() => {
  ledger.clear()
  jest.clearAllMocks()
  prismaMock.subscription.findFirst.mockResolvedValue({
    id: 'row-1',
    userId: 'user-1',
    plan: 'pro',
    subscriptionId: 'sub_1',
  })
  prismaMock.subscription.update.mockResolvedValue({})
})

describe('Razorpay webhook — subscription lifecycle dedup', () => {
  it('processes a later lifecycle transition after activated (not swallowed as a redelivery)', async () => {
    const activated = await POST(makeRequest(subscriptionEvent('subscription.activated')))
    expect(activated.status).toBe(200)

    const cancelled = await POST(makeRequest(subscriptionEvent('subscription.cancelled')))
    expect(cancelled.status).toBe(200)

    // Both handlers ran: the cancelled event was NOT deduped away.
    expect(prismaMock.subscription.findFirst).toHaveBeenCalledTimes(2)
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    )

    // Each event claimed its own, event-scoped ledger row.
    const keys = prismaMock.webhookEvent.create.mock.calls.map(
      (c: any[]) => c[0].data.entityId,
    )
    expect(keys).toEqual([
      'subscription.activated:sub_1',
      'subscription.cancelled:sub_1',
    ])
  })

  it('still dedupes a true redelivery of the SAME event', async () => {
    await POST(makeRequest(subscriptionEvent('subscription.activated')))
    await POST(makeRequest(subscriptionEvent('subscription.activated')))

    // The duplicate delivery never re-ran the handler.
    expect(prismaMock.subscription.findFirst).toHaveBeenCalledTimes(1)
    expect(prismaMock.subscription.update).toHaveBeenCalledTimes(1)
  })

  it('extends the paid period and resets included usage on every renewal charge', async () => {
    const firstCharge = subscriptionEvent('subscription.charged')
    ;(firstCharge.payload.subscription.entity as any).current_end = 1_705_184_000
    ;(firstCharge.payload as any).payment = { entity: { id: 'pay_1', amount: 149900 } }

    const secondCharge = subscriptionEvent('subscription.charged')
    ;(secondCharge.payload.subscription.entity as any).current_end = 1_707_776_000
    ;(secondCharge.payload as any).payment = { entity: { id: 'pay_2', amount: 149900 } }

    await POST(makeRequest(firstCharge))
    await POST(makeRequest(secondCharge))

    expect(prismaMock.subscription.findFirst).toHaveBeenCalledTimes(2)
    expect(prismaMock.subscription.update).toHaveBeenCalledTimes(2)
    expect(prismaMock.subscription.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active',
          currentPeriodEnd: new Date(1_707_776_000 * 1000),
          cartsUsedInPeriod: 0,
          bargainSessionsUsed: 0,
          bargainDealsUsed: 0,
        }),
      }),
    )

    const keys = prismaMock.webhookEvent.create.mock.calls.map(
      (c: any[]) => c[0].data.entityId,
    )
    expect(keys).toEqual([
      'charged:sub_1:1705184000',
      'charged:sub_1:1707776000',
    ])
  })
})
