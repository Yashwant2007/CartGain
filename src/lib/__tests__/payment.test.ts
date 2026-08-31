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
