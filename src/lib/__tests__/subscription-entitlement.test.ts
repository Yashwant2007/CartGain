import { evaluateSubscriptionEntitlement, RENEWAL_WARNING_DAYS } from '@/lib/subscription-entitlement'

const NOW = new Date('2026-10-30T12:00:00Z')

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000)
}

describe('evaluateSubscriptionEntitlement', () => {
  it('grants an active paid plan until its period ends', () => {
    const result = evaluateSubscriptionEntitlement(
      { plan: 'growth', status: 'active', currentPeriodEnd: daysFromNow(20) },
      NOW,
    )
    expect(result.isPaid).toBe(true)
    expect(result.isEntitled).toBe(true)
    expect(result.isExpired).toBe(false)
    expect(result.effectivePlanId).toBe('growth')
    expect(result.daysRemaining).toBe(20)
  })

  it('revokes paid access once the billing period has ended', () => {
    const result = evaluateSubscriptionEntitlement(
      { plan: 'pro', status: 'active', currentPeriodEnd: daysFromNow(-1) },
      NOW,
    )
    expect(result.isPaid).toBe(false)
    expect(result.isEntitled).toBe(false)
    expect(result.isExpired).toBe(true)
    expect(result.effectivePlanId).toBe('free')
  })

  it('never grants a paid plan from a non-active status', () => {
    const result = evaluateSubscriptionEntitlement(
      { plan: 'growth', status: 'cancelled', currentPeriodEnd: daysFromNow(20) },
      NOW,
    )
    expect(result.isPaid).toBe(false)
    expect(result.effectivePlanId).toBe('free')
  })

  it('keeps legacy active paid rows with no recorded period end entitled', () => {
    const result = evaluateSubscriptionEntitlement(
      { plan: 'growth', status: 'active', currentPeriodEnd: null },
      NOW,
    )
    expect(result.isPaid).toBe(true)
    expect(result.isExpired).toBe(false)
  })

  it('keeps the free tier usable regardless of its stored period', () => {
    const result = evaluateSubscriptionEntitlement(
      { plan: 'free', status: 'active', currentPeriodEnd: daysFromNow(-400) },
      NOW,
    )
    expect(result.isPaid).toBe(false)
    expect(result.isEntitled).toBe(true)
    expect(result.effectivePlanId).toBe('free')
  })

  it('flags renewal within the warning window', () => {
    const dueSoon = evaluateSubscriptionEntitlement(
      { plan: 'growth', status: 'active', currentPeriodEnd: daysFromNow(RENEWAL_WARNING_DAYS) },
      NOW,
    )
    const later = evaluateSubscriptionEntitlement(
      { plan: 'growth', status: 'active', currentPeriodEnd: daysFromNow(RENEWAL_WARNING_DAYS + 1) },
      NOW,
    )
    expect(dueSoon.renewalDueSoon).toBe(true)
    expect(later.renewalDueSoon).toBe(false)
  })
})
