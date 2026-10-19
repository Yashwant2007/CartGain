import { resolvePlanId, getPlan, PLANS, PLAN_IDS } from '../payment'

describe('resolvePlanId / getPlan (canonical lowercase ids)', () => {
  it('resolves lowercase unified ids to themselves (not to free)', () => {
    expect(resolvePlanId('growth')).toBe('growth')
    expect(resolvePlanId('pro')).toBe('pro')
    expect(resolvePlanId('free')).toBe('free')
    expect(resolvePlanId('enterprise')).toBe('enterprise')
  })

  it('is case-insensitive and maps legacy ids', () => {
    expect(resolvePlanId('GROWTH')).toBe('growth')
    expect(resolvePlanId('Pro')).toBe('pro')
    expect(resolvePlanId('starter')).toBe('growth')
    // unknown/garbage falls back to free safely
    expect(resolvePlanId('nonsense')).toBe('free')
  })

  it('getPlan returns the paid plan object (not free) for paid tiers', () => {
    const growth = getPlan('growth')
    expect(growth.id).toBe('growth')
    expect(growth.price).toBe(PLANS.GROWTH.price)
    expect(growth.bargainSessions).toBe(PLANS.GROWTH.bargainSessions)
    expect(growth.bargainDeals).toBe(PLANS.GROWTH.bargainDeals)

    const pro = getPlan('PRO')
    expect(pro.id).toBe('pro')
    expect(pro.price).toBe(PLANS.PRO.price)
  })

  it('ensures create-subscription no longer resolves paid tiers to price 0', () => {
    // Regression: used to collapse to free -> "Invalid plan" & zeroed meters.
    expect(getPlan('growth').price).toBeGreaterThan(0)
    expect(getPlan('pro').price).toBeGreaterThan(0)
  })

  it('PLAN_IDS values are the canonical lowercase ids used in the DB', () => {
    expect(PLAN_IDS.GROWTH).toBe('growth')
    expect(PLAN_IDS.PRO).toBe('pro')
  })
})

describe('unified messaging, campaigns & overage model', () => {
  it('caps every plan (including Enterprise) at 3 email + 2 WhatsApp per customer', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.maxMessagesPerCustomer).toEqual({ email: 3, whatsapp: 2 })
    }
  })

  it('sets campaign limits Free 1 / Growth 5 / Pro 15 / Enterprise unlimited', () => {
    expect(PLANS.FREE.maxCampaigns).toBe(1)
    expect(PLANS.GROWTH.maxCampaigns).toBe(5)
    expect(PLANS.PRO.maxCampaigns).toBe(15)
    expect(PLANS.ENTERPRISE.maxCampaigns).toBe(Infinity)
  })

  it('no longer advertises a "No CartGain branding" perk on any plan', () => {
    for (const plan of Object.values(PLANS)) {
      for (const feature of plan.features) {
        expect(feature.toLowerCase()).not.toContain('cartgain branding')
      }
    }
  })

  it('prices overage on paid plans so metering can actually bill it', () => {
    // Paid plans: metered overage on carts and deals.
    expect(PLANS.GROWTH.bargainOverageCartPrice).toBeGreaterThan(0)
    expect(PLANS.PRO.bargainOverageCartPrice).toBeGreaterThan(0)
    expect(PLANS.GROWTH.bargainOverageDealPrice).toBeGreaterThan(0)
    expect(PLANS.PRO.bargainOverageDealPrice).toBeGreaterThan(0)
    // Free stays a hard cap (no overage), Enterprise is unlimited/custom.
    expect(PLANS.FREE.bargainOverageCartPrice).toBe(0)
    expect(PLANS.FREE.bargainOverageDealPrice).toBe(0)
    expect(PLANS.ENTERPRISE.maxCarts).toBe(Infinity)
  })
})
