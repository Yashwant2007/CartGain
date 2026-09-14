import {
  normalizeCurrency,
  isSupportedBillingCurrency,
  resolveBillingPrice,
  resolveUsageCap,
  SHOPIFY_BILLING_PRICES,
  SHOPIFY_USAGE_CAPS,
} from '../plans'
import { PLANS } from '@/lib/payment'

describe('normalizeCurrency / isSupportedBillingCurrency', () => {
  it('normalizes valid currencies to upper-case', () => {
    expect(normalizeCurrency('inr')).toBe('INR')
    expect(normalizeCurrency('USD')).toBe('USD')
    expect(normalizeCurrency('usd')).toBe('USD')
  })

  it('returns null for unsupported currencies and null/undefined', () => {
    expect(normalizeCurrency('EUR')).toBeNull()
    expect(normalizeCurrency('gbp')).toBeNull()
    expect(normalizeCurrency(null)).toBeNull()
    expect(normalizeCurrency(undefined)).toBeNull()
    expect(normalizeCurrency('')).toBeNull()
  })

  it('isSupportedBillingCurrency is true only when normalizeCurrency is non-null', () => {
    expect(isSupportedBillingCurrency('inr')).toBe(true)
    expect(isSupportedBillingCurrency('usd')).toBe(true)
    expect(isSupportedBillingCurrency('eur')).toBe(false)
    expect(isSupportedBillingCurrency(null)).toBe(false)
  })
})

describe('INR prices are derived from PLANS (no drift)', () => {
  it('Growth INR monthly == PLANS.GROWTH.price', () => {
    expect(SHOPIFY_BILLING_PRICES.INR['growth']?.monthly).toBe(PLANS.GROWTH.price)
  })

  it('Growth INR yearly == PLANS.GROWTH.yearlyPrice', () => {
    expect(SHOPIFY_BILLING_PRICES.INR['growth']?.yearly).toBe(PLANS.GROWTH.yearlyPrice)
  })

  it('Pro INR monthly == PLANS.PRO.price', () => {
    expect(SHOPIFY_BILLING_PRICES.INR['pro']?.monthly).toBe(PLANS.PRO.price)
  })

  it('Pro INR yearly == PLANS.PRO.yearlyPrice', () => {
    expect(SHOPIFY_BILLING_PRICES.INR['pro']?.yearly).toBe(PLANS.PRO.yearlyPrice)
  })
})

describe('resolveBillingPrice', () => {
  it('returns null for missing currency (never guess)', () => {
    expect(resolveBillingPrice('growth', 'monthly', null)).toBeNull()
    expect(resolveBillingPrice('growth', 'monthly', 'EUR')).toBeNull()
    expect(resolveBillingPrice('growth', 'monthly', undefined)).toBeNull()
  })

  it('resolves monthly and yearly amounts for INR', () => {
    const monthly = resolveBillingPrice('growth', 'monthly', 'INR')
    expect(monthly).toEqual({ amount: PLANS.GROWTH.price, currency: 'INR' })

    const yearly = resolveBillingPrice('pro', 'yearly', 'INR')
    expect(yearly).toEqual({ amount: PLANS.PRO.yearlyPrice, currency: 'INR' })
  })

  it('resolves USD placeholders for shopify shops', () => {
    const monthly = resolveBillingPrice('growth', 'monthly', 'USD')
    expect(monthly).toEqual({ amount: 19, currency: 'USD' })

    const yearly = resolveBillingPrice('pro', 'yearly', 'USD')
    expect(yearly).toEqual({ amount: 490, currency: 'USD' })
  })

  it('returns null for unknown plan ids', () => {
    expect(resolveBillingPrice('enterprise', 'monthly', 'INR')).toBeNull()
    expect(resolveBillingPrice('unknown', 'monthly', 'INR')).toBeNull()
  })
})

describe('usage caps', () => {
  it('returns null for unsupported currency', () => {
    expect(resolveUsageCap('growth', null)).toBeNull()
    expect(resolveUsageCap('growth', 'EUR')).toBeNull()
  })

  it('returns INR cap derived from PLANS', () => {
    expect(resolveUsageCap('growth', 'INR')).toBe(PLANS.GROWTH.revShareCap)
    expect(resolveUsageCap('pro', 'INR')).toBe(PLANS.PRO.revShareCap)
  })

  it('returns placeholder USD caps', () => {
    expect(resolveUsageCap('growth', 'USD')).toBe(60)
    expect(resolveUsageCap('pro', 'USD')).toBe(120)
  })
})
