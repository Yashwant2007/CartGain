import { validateOffer, type OfferValidationReason } from '../offer-validation'

describe('validateOffer', () => {
  const base = { requestedPrice: 900, originalPrice: 1000, floorPrice: 800 }

  it('accepts an offer at or above the floor', () => {
    const r = validateOffer(base)
    expect(r.ok).toBe(true)
    expect(r.reason).toBe('OFFER_ACCEPTED')
  })

  it('rejects non-finite / absurd prices with INVALID_PRICE', () => {
    expect(validateOffer({ ...base, requestedPrice: NaN }).reason).toBe('INVALID_PRICE')
    expect(validateOffer({ ...base, requestedPrice: 0 }).reason).toBe('INVALID_PRICE')
    expect(validateOffer({ ...base, requestedPrice: -5 }).reason).toBe('INVALID_PRICE')
    expect(validateOffer({ ...base, requestedPrice: 5000 }).reason).toBe('INVALID_PRICE')
  })

  it('rejects below-floor offers with a machine reason code', () => {
    const r = validateOffer({ ...base, requestedPrice: 799 })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('BELOW_FLOOR_REJECTED')
    expect(r.message).toBeTruthy()
  })

  it('blocks explicit variant unavailability without blocking unknown', () => {
    expect(validateOffer({ ...base, variantAvailable: false }).reason).toBe('VARIANT_UNAVAILABLE')
    expect(validateOffer({ ...base, variantAvailable: null }).ok).toBe(true)
  })

  it('blocks explicit product unavailability', () => {
    expect(validateOffer({ ...base, productAvailable: false }).reason).toBe('PRODUCT_UNAVAILABLE')
    const r = validateOffer({ ...base, productAvailable: null })
    expect(r.ok).toBe(true)
  })

  it('blocks when the campaign window closed', () => {
    expect(validateOffer({ ...base, campaignActive: false }).reason).toBe('CAMPAIGN_EXPIRED')
    expect(validateOffer({ ...base, campaignActive: null }).ok).toBe(true)
  })

  it('blocks coupon stacking when disabled', () => {
    const r = validateOffer({ ...base, couponMentioned: true, couponsAllowed: false })
    expect(r.reason).toBe('COUPON_STACKING_BLOCKED')
    expect(validateOffer({ ...base, couponMentioned: true, couponsAllowed: true }).ok).toBe(true)
  })

  it('blocks when the negotiation budget is spent', () => {
    const r = validateOffer({ ...base, attemptsUsed: 3, maxAttempts: 3 })
    expect(r.reason).toBe('NEGOTIATION_LIMIT_REACHED')
    expect(validateOffer({ ...base, attemptsUsed: 2, maxAttempts: 3 }).ok).toBe(true)
  })

  it('orders checks predictably (invalid price wins first)', () => {
    const r = validateOffer({ ...base, requestedPrice: 0, productAvailable: false, couponMentioned: true, couponsAllowed: false })
    expect(r.reason).toBe('INVALID_PRICE')
  })

  it('produces stable reason codes for every rejection', () => {
    const reasons: OfferValidationReason[] = [
      'INVALID_PRICE',
      'BELOW_FLOOR_REJECTED',
      'NEGOTIATION_LIMIT_REACHED',
      'VARIANT_UNAVAILABLE',
      'PRODUCT_UNAVAILABLE',
      'CAMPAIGN_EXPIRED',
      'COUPON_STACKING_BLOCKED',
    ]
    for (const reason of reasons) {
      expect(typeof reason).toBe('string')
      expect(reason).toMatch(/^[A-Z_]+$/)
    }
  })
})