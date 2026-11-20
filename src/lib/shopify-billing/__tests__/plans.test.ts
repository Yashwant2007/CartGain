import {
  normalizeCurrency,
  isSupportedBillingCurrency,
  resolveBillingPrice,
  resolveUsageCap,
  resolveOveragePrices,
  resolveInvoiceFloor,
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

  it('fails closed for USD until the Partner Dashboard prices are configured', () => {
    expect(resolveBillingPrice('growth', 'monthly', 'USD')).toBeNull()
    expect(resolveBillingPrice('pro', 'yearly', 'USD')).toBeNull()
  })

  it('resolves USD prices only from explicit configuration', () => {
    process.env.SHOPIFY_BILLING_USD_GROWTH_MONTHLY = '25'
    process.env.SHOPIFY_BILLING_USD_PRO_YEARLY = '590'
    try {
      expect(resolveBillingPrice('growth', 'monthly', 'USD')).toEqual({ amount: 25, currency: 'USD' })
      expect(resolveBillingPrice('pro', 'yearly', 'USD')).toEqual({ amount: 590, currency: 'USD' })
    } finally {
      delete process.env.SHOPIFY_BILLING_USD_GROWTH_MONTHLY
      delete process.env.SHOPIFY_BILLING_USD_PRO_YEARLY
    }
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

  it('fails closed for USD caps until configured', () => {
    expect(resolveUsageCap('growth', 'USD')).toBeNull()
    expect(resolveUsageCap('pro', 'USD')).toBeNull()
  })

  it('resolves USD caps only from explicit configuration', () => {
    process.env.SHOPIFY_BILLING_USD_GROWTH_USAGE_CAP = '75'
    try {
      expect(resolveUsageCap('growth', 'USD')).toBe(75)
    } finally {
      delete process.env.SHOPIFY_BILLING_USD_GROWTH_USAGE_CAP
    }
  })
})

describe('USD overage and invoice configuration', () => {
  afterEach(() => {
    for (const key of [
      'SHOPIFY_BILLING_USD_GROWTH_OVERAGE_MESSAGE',
      'SHOPIFY_BILLING_USD_GROWTH_OVERAGE_DEAL',
      'SHOPIFY_BILLING_USD_GROWTH_OVERAGE_CART',
      'SHOPIFY_BILLING_USD_INVOICE_FLOOR',
    ]) {
      delete process.env[key]
    }
  })

  it('fails closed for USD overages until every amount is configured', () => {
    expect(resolveOveragePrices('growth', 'USD')).toBeNull()
    process.env.SHOPIFY_BILLING_USD_GROWTH_OVERAGE_MESSAGE = '0.02'
    process.env.SHOPIFY_BILLING_USD_GROWTH_OVERAGE_DEAL = '0.3'
    expect(resolveOveragePrices('growth', 'USD')).toBeNull()
  })

  it('uses configured USD overages and invoice floor', () => {
    process.env.SHOPIFY_BILLING_USD_GROWTH_OVERAGE_MESSAGE = '0.02'
    process.env.SHOPIFY_BILLING_USD_GROWTH_OVERAGE_DEAL = '0.3'
    process.env.SHOPIFY_BILLING_USD_GROWTH_OVERAGE_CART = '0.04'
    process.env.SHOPIFY_BILLING_USD_INVOICE_FLOOR = '1.25'
    expect(resolveOveragePrices('growth', 'USD')).toEqual({ message: 0.02, deal: 0.3, cart: 0.04 })
    expect(resolveInvoiceFloor('USD')).toBe(1.25)
  })
})
