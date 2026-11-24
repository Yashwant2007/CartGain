import {
  classifyCustomerIntent,
  evaluateMarginDecision,
  selectMarginIncentive,
  type MarginBehaviorSignals,
  type MerchantMarginPolicy,
} from '../margin-intelligence'

const policy: MerchantMarginPolicy = {
  configured: true,
  minGrossMarginBps: 1500,
  maxDiscountBps: 1000,
  maxBargainAttempts: 3,
  bundleEligible: true,
  shippingIncentiveLimitMinor: 9900,
  campaignSpendLimitMinor: 200000,
}

describe('classifyCustomerIntent', () => {
  it('does not classify a negotiator as a discount hunter', () => {
    const result = classifyCustomerIntent({ bargainAttempts: 4, cartCreated: true, priceComplaints: 1 })
    expect(result.category).not.toBe('discount_hunter')
  })

  it('classifies a repeat coupon seeker as a discount hunter', () => {
    const result = classifyCustomerIntent({
      previousCouponUses: 3,
      discountCodeMentions: 3,
      priceComplaints: 2,
      bargainAttempts: 1,
    })
    expect(result.category).toBe('discount_hunter')
  })

  it('classifies high purchase intent without treating it as price sensitivity', () => {
    const result = classifyCustomerIntent({
      cartCreated: true,
      cartAbandoned: false,
      productDwellMs: 60000,
      scrollDepthPercent: 80,
    })
    expect(result.category).toBe('high_purchase_intent')
    expect(result.uncertaintyFallback).toBe(false)
  })

  it('uses mobile-safe engagement instead of desktop exit intent', () => {
    const result = classifyCustomerIntent({
      cartAbandoned: true,
      mobileBehaviorSignal: 'cart_return',
      exitIntentObserved: null,
    })
    expect(result.category).toBe('high_abandonment_risk')
  })

  it('falls back to uncertainty when signals are thin', () => {
    const result = classifyCustomerIntent({ priceComplaints: 1 })
    expect(result.uncertaintyFallback).toBe(true)
    expect(result.confidence).toBeLessThan(0.6)
  })
})

describe('selectMarginIncentive', () => {
  it('encourages full price for high-intent buyers', () => {
    const signals: MarginBehaviorSignals = {
      cartCreated: true,
      productDwellMs: 60000,
      scrollDepthPercent: 80,
      inventoryAvailable: true,
    }
    const decision = selectMarginIncentive(signals, policy)
    expect(decision.type).toBe('full_price_encouragement')
    expect(decision.financialIncentiveAllowed).toBe(false)
  })

  it('uses non-cash loyalty benefits for returning customers', () => {
    const signals: MarginBehaviorSignals = {
      previousPurchases: 3,
      repeatVisits: 2,
      inventoryAvailable: true,
    }
    expect(selectMarginIncentive(signals, policy).type).toBe('loyalty_non_cash_perk')
  })

  it('allows contextual negotiation only for abandonment risk with a configured policy', () => {
    const signals: MarginBehaviorSignals = {
      cartCreated: true,
      cartAbandoned: true,
      exitIntentObserved: true,
      inventoryAvailable: true,
    }
    const decision = selectMarginIncentive(signals, policy)
    expect(decision.type).toBe('contextual_negotiation')
    expect(decision.requiresDeterministicPriceValidation).toBe(true)
    expect(selectMarginIncentive(signals, { ...policy, configured: false }).type).toBe('non_cash_incentive')
  })

  it('prefers a profitable bundle for price-sensitive shoppers', () => {
    const signals: MarginBehaviorSignals = {
      cartCreated: true,
      priceComplaints: 2,
      bundleEligible: true,
      inventoryAvailable: true,
    }
    const decision = selectMarginIncentive(signals, policy)
    expect(decision.type).toBe('bundle_value')
    expect(decision.financialIncentiveAllowed).toBe(true)
  })

  it('never offers a financial incentive when margin protection blocks it', () => {
    const signals: MarginBehaviorSignals = {
      cartCreated: true,
      cartAbandoned: true,
      exitIntentObserved: true,
      productMarginBps: 800,
      inventoryAvailable: true,
    }
    const decision = selectMarginIncentive(signals, { ...policy, minGrossMarginBps: 1500 })
    expect(decision.type).toBe('non_cash_incentive')
    expect(decision.financialIncentiveAllowed).toBe(false)
  })

  it('uses free shipping only inside the configured limit', () => {
    const signals: MarginBehaviorSignals = {
      shippingSensitive: true,
      shippingCostMinor: 7000,
      cartCreated: true,
      inventoryAvailable: true,
    }
    expect(selectMarginIncentive(signals, policy).type).toBe('free_shipping')
    const overLimit = selectMarginIncentive({ ...signals, shippingCostMinor: 12000 }, policy)
    expect(overLimit.type).toBe('non_cash_incentive')
  })

  it('refuses automatic incentives for uncertain or unavailable inventory', () => {
    expect(selectMarginIncentive({}, policy).type).toBe('no_automatic_financial_incentive')
    expect(
      selectMarginIncentive(
        { cartCreated: true, cartAbandoned: true, exitIntentObserved: true, inventoryAvailable: false },
        policy,
      ).type,
    ).toBe('no_automatic_financial_incentive')
  })

  it('reports policy safety with integer attempt limits', () => {
    const decision = evaluateMarginDecision(
      { cartAbandoned: true, exitIntentObserved: true, bargainAttempts: 3, inventoryAvailable: true },
      policy,
    )
    expect(decision.policySafe).toBe(false)
    expect(decision.incentive.rationaleCodes).toContain('BARGAIN_ATTEMPTS_EXHAUSTED')
  })
})
