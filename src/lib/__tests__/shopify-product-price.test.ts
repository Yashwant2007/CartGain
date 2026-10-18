/**
 * @jest-environment node
 *
 * Regression test: fetchShopifyProductPrice must NOT fall back to another
 * variant's price when a specific variantId was requested but does not belong
 * to the product. Returning variants[0] there quoted the wrong price and could
 * weaken the negotiation floor. Unknown variant → null so callers use their own
 * verified/default price.
 */
import { fetchShopifyProductPrice } from '@/lib/shopify'

jest.mock('@/lib/encryption', () => ({
  decrypt: jest.fn(() => 'tok'),
  encrypt: jest.fn(() => 'enc'),
}))

const store = {
  id: 'store-1',
  domain: 'test.myshopify.com',
  apiKey: 'enc',
  shopifyRefreshToken: null,
  shopifyTokenExpiresAt: null,
}

function mockProduct(variants: Array<{ id: number; price: string }>) {
  ;(global as any).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ product: { variants } }),
  }))
}

describe('fetchShopifyProductPrice — variant handling', () => {
  it('returns the requested variant price when it belongs to the product', async () => {
    mockProduct([
      { id: 111, price: '100.00' },
      { id: 222, price: '150.00' },
    ])
    const price = await fetchShopifyProductPrice(
      store,
      'gid://shopify/Product/9',
      'gid://shopify/ProductVariant/222',
    )
    expect(price).toBe(150)
  })

  it('returns null instead of another variant price when the variant is not on the product', async () => {
    mockProduct([
      { id: 111, price: '100.00' },
      { id: 222, price: '150.00' },
    ])
    const price = await fetchShopifyProductPrice(
      store,
      'gid://shopify/Product/9',
      'gid://shopify/ProductVariant/999',
    )
    expect(price).toBeNull()
  })

  it('falls back to the first variant price when no variant is requested', async () => {
    mockProduct([
      { id: 111, price: '100.00' },
      { id: 222, price: '150.00' },
    ])
    const price = await fetchShopifyProductPrice(store, 'gid://shopify/Product/9', null)
    expect(price).toBe(100)
  })
})
