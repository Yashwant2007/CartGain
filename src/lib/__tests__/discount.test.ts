import { generateBargainDiscountCode } from '@/lib/bargain/discount'

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
})