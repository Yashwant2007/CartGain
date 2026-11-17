import { generateBargainDiscountCode, buildCustomerSelection } from '@/lib/bargain/discount'
import {
  buildBasicCodeDiscount,
  buildDiscountValue,
  resolveDiscountTarget,
} from '@/lib/shopify/discount'

jest.mock('@/lib/shopify', () => ({
  getAccessToken: jest.fn(),
}))

jest.mock('@/lib/shopify-graphql', () => ({
  queryShopifyGraphQL: jest.fn(),
}))

import { getAccessToken } from '@/lib/shopify'

const STORE = {
  id: 's1',
  name: 'Test Store',
  domain: 'test-store.myshopify.com',
  currency: 'INR',
  platform: 'shopify',
  apiKey: null,
  shopifyRefreshToken: null,
  shopifyTokenExpiresAt: null,
}

const baseOpts = {
  store: STORE,
  shopifyProductId: 'p1',
  originalPrice: 1000,
  finalPrice: 800,
  discountPercent: 20,
  code: 'BARGAIN-ABC123',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('generateBargainDiscountCode — financial safety', () => {
  it('rejects any discount that would charge below the merchant floor (no network needed)', async () => {
    // An integer-rounded percent of 20 would charge exactly 800 — but the
    // generator re-derives the EXACT percent. For a genuinely below-floor final
    // (800 < floor 801.5) the code must refuse outright, before any Shopify call.
    const ok = await generateBargainDiscountCode({
      ...baseOpts,
      finalPrice: 800,
      floorPrice: 801.5,
    })
    expect(ok.status).toBe('failed')
    expect(ok.error).toContain('breach merchant floor')
    expect(getAccessToken).not.toHaveBeenCalled()
  })

  it('derives the exact percent from (original, final) — never trusts caller rounding', async () => {
    const result = await generateBargainDiscountCode({
      ...baseOpts,
      // Caller says 19.8% (its own Math.round would have said 20). The generator
      // recomputes from the money values, not the caller's percent.
      discountPercent: 19.8,
      floorPrice: 800,
      bulkQuantity: 1,
    })
    expect(result.status).toBe('pending') // no Shopify token → pending, no network
    expect(getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('returns pending when Shopify is not connected (no network involved)', async () => {
    (getAccessToken as jest.Mock).mockResolvedValue(null)
    const result = await generateBargainDiscountCode({ ...baseOpts, floorPrice: 800 })
    expect(result.status).toBe('pending')
    expect(result.code).toBe('BARGAIN-ABC123')
  })

  it('never corrupts the code with binding metadata in the pending path', async () => {
    (getAccessToken as jest.Mock).mockResolvedValue(null)
    const result = await generateBargainDiscountCode({
      ...baseOpts,
      floorPrice: 800,
      customerEmail: 'buyer@example.com',
      cartToken: 'cart-1',
    })
    expect(result.status).toBe('pending')
    expect(result.code).toBe('BARGAIN-ABC123')
  })
})

describe('buildCustomerSelection', () => {
  it('binds to a specific customer when a Shopify id is available', () => {
    expect(buildCustomerSelection('123456')).toEqual({
      customers: { add: ['gid://shopify/Customer/123456'] },
    })
  })

  it('accepts an already-formed customer GID', () => {
    expect(buildCustomerSelection('gid://shopify/Customer/999')).toEqual({
      customers: { add: ['gid://shopify/Customer/999'] },
    })
  })

  it('falls back to all-customers (single-use, not customer-bound) without an id', () => {
    expect(buildCustomerSelection(null)).toEqual({ all: true })
    expect(buildCustomerSelection(undefined)).toEqual({ all: true })
    expect(buildCustomerSelection('  ')).toEqual({ all: true })
  })
})

describe('Shopify 2026-04 discount input', () => {
  it('uses context, nested value and nested minimum subtotal', () => {
    const input = buildBasicCodeDiscount({
      store: STORE,
      code: 'BARGAIN-ABC123',
      title: 'Bargain BARGAIN-ABC123',
      value: { kind: 'percentage', percentage: 20 },
      target: resolveDiscountTarget({ productId: '12345' }),
      minimumSubtotal: 100,
      shopifyCustomerId: '999',
    })
    expect(input).toMatchObject({
      code: 'BARGAIN-ABC123',
      context: { customers: { add: ['gid://shopify/Customer/999'] } },
      customerGets: {
        value: { percentage: 0.2 },
        items: { products: { productsToAdd: ['gid://shopify/Product/12345'] } },
      },
      minimumRequirement: {
        subtotal: { greaterThanOrEqualToSubtotal: '100.00' },
      },
    })
    expect(input).not.toHaveProperty('customerSelection')
    expect(input).not.toHaveProperty('value')
    expect(input).not.toHaveProperty('minimumSubtotal')
    expect(input).not.toHaveProperty('summary')
  })

  it('maps a ProductVariant GID sent in the product field to productVariantsToAdd', () => {
    expect(resolveDiscountTarget({ productId: 'gid://shopify/ProductVariant/42' })).toEqual({
      scope: 'variant',
      variantGids: ['gid://shopify/ProductVariant/42'],
    })
  })

  it('keeps fixed decimal amounts as strings and percentages between 0 and 1', () => {
    expect(buildDiscountValue({ kind: 'fixed', amount: 25 })).toEqual({
      discountAmount: { amount: '25.00', appliesOnEachItem: false },
    })
    expect(buildDiscountValue({ kind: 'percentage', percentage: 12.5 })).toEqual({
      percentage: 0.125,
    })
  })
})