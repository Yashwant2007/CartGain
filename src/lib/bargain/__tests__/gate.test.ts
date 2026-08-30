import { decideDealMode, BARGAIN_DEALS_EXHAUSTED, BARGAIN_SESSIONS_EXHAUSTED } from '../gate'
import type { BargainGate } from '../gate'

function makeGate(overrides: Partial<BargainGate> = {}): BargainGate {
  return {
    storeId: 'store_1',
    userId: 'user_1',
    subscriptionId: 'sub_1',
    planId: 'growth',
    plan: {
      id: 'growth',
      name: 'Growth',
      price: 1499,
      yearlyPrice: 14990,
      maxCarts: 750,
      maxCampaigns: 5,
      maxMessagesPerCustomer: { email: 10, sms: 10, whatsapp: 10 },
      features: [],
      revSharePercent: 3.5,
      revShareCap: 5000,
      bargainSessions: 300,
      bargainDeals: 30,
      bargainOverageDealPrice: 25,
      bargainOverageCartPrice: 3,
      storesLimit: 3,
      estimatedRecovery: { min: 0, max: 1000 },
    },
    isPaid: true,
    overageEnabled: true,
    sessionsUsed: 0,
    sessionsLimit: 300,
    sessionsRemaining: 300,
    dealsUsed: 0,
    dealsLimit: 30,
    dealsRemaining: 30,
    sessionsExhausted: false,
    dealsExhausted: false,
    ...overrides,
  }
}

describe('decideDealMode', () => {
  test('included while under quota', () => {
    expect(decideDealMode(makeGate())).toBe('included')
  })

  test('paid plan with overage enabled meters excess as overage', () => {
    const gate = makeGate({ dealsExhausted: true, dealsRemaining: 0 })
    expect(decideDealMode(gate)).toBe('overage')
  })

  test('paid plan without overage blocks', () => {
    const gate = makeGate({ dealsExhausted: true, dealsRemaining: 0, overageEnabled: false })
    expect(decideDealMode(gate)).toBe('blocked_no_overage')
  })

  test('free plan hard-stops at the deal quota', () => {
    const gate = makeGate({
      planId: 'free',
      isPaid: false,
      dealsExhausted: true,
      dealsRemaining: 0,
    })
    expect(decideDealMode(gate)).toBe('blocked_free')
  })
})

describe('limit error codes', () => {
  test('codes are stable for widget consumption', () => {
    expect(BARGAIN_SESSIONS_EXHAUSTED).toBe('bargain_sessions_exhausted')
    expect(BARGAIN_DEALS_EXHAUSTED).toBe('bargain_deals_exhausted')
  })
})