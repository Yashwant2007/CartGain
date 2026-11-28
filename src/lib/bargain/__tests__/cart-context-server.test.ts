import { resolveVerifiedCartContext } from '@/lib/bargain/cart-context-server'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { getWooCommerceProductFacts } from '@/lib/woocommerce/bargain-adapter'

jest.mock('@/lib/shopify', () => ({
  fetchShopifyProductPrice: jest.fn(async () => null),
}))

jest.mock('@/lib/woocommerce/bargain-adapter', () => ({
  getWooCommerceProductFacts: jest.fn(async () => null),
}))

const shopifyPriceMock = fetchShopifyProductPrice as jest.Mock
const wooFactsMock = getWooCommerceProductFacts as jest.Mock

const config = { bundleNegotiationEnabled: true, bundleDiscountPercent: 10 }
const store = { id: 'store-1', domain: 'test.myshopify.com' }

function rawCart(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'shopify',
    cartToken: 'cart-token',
    cartId: 'cart-token',
    storeId: 'test.myshopify.com',
    currency: 'USD',
    requestedMode: 'bundle',
    lines: [
      {
        lineId: 'line-1',
        productId: 'gid://shopify/Product/1',
        variantId: 'gid://shopify/ProductVariant/1',
        title: 'Serum',
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
      },
      {
        lineId: 'line-2',
        productId: 'gid://shopify/Product/2',
        variantId: 'gid://shopify/ProductVariant/2',
        title: 'Moisturizer',
        quantity: 2,
        unitPrice: 50,
        lineTotal: 100,
      },
    ],
    subtotal: 200,
    totalValue: 210,
    discountCodes: [],
    customerEmail: 'buyer@example.com',
    customerPhone: null,
    customerId: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  shopifyPriceMock.mockImplementation(async (_store: unknown, productId: string) =>
    productId.includes('/1') ? 100 : 50,
  )
  wooFactsMock.mockResolvedValue(null)
})

describe('resolveVerifiedCartContext', () => {
  it('re-prices lines from Shopify and recomputes the subtotal', async () => {
    const result = await resolveVerifiedCartContext(rawCart(), {
      store,
      platform: 'shopify',
      config,
      expectedCartToken: 'cart-token',
    })

    expect(result).toMatchObject({
      source: 'server',
      mode: 'bundle',
      platform: 'shopify',
      subtotal: 200,
      totalValue: 210,
      lines: [
        { lineId: 'line-1', unitPrice: 100, lineTotal: 100 },
        { lineId: 'line-2', unitPrice: 50, lineTotal: 100 },
      ],
    })
    expect(result?.versionHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns null when merchant configuration disables cart-wide modes', async () => {
    const result = await resolveVerifiedCartContext(rawCart(), {
      store,
      platform: 'shopify',
      config: { bundleNegotiationEnabled: false },
      expectedCartToken: 'cart-token',
    })

    expect(result).toBeNull()
  })

  it('rejects a cart token that does not match the session', async () => {
    const result = await resolveVerifiedCartContext(rawCart(), {
      store,
      platform: 'shopify',
      config,
      expectedCartToken: 'different-token',
    })

    expect(result).toBeNull()
  })

  it('rejects client prices that drift beyond the verified tolerance', async () => {
    shopifyPriceMock.mockImplementation(async (_store: unknown, productId: string) =>
      productId.includes('/1') ? 100 : 70,
    )

    const result = await resolveVerifiedCartContext(rawCart(), {
      store,
      platform: 'shopify',
      config,
      expectedCartToken: 'cart-token',
    })

    expect(result).toBeNull()
  })

  it('re-prices WooCommerce lines through the WooCommerce adapter', async () => {
    wooFactsMock.mockImplementation(async ({ productId }: { productId: string }) => ({
      price: productId.includes('/1') ? 100 : 50,
    }))

    const result = await resolveVerifiedCartContext(rawCart({ platform: 'woocommerce' }), {
      store,
      platform: 'woocommerce',
      config,
      expectedCartToken: 'cart-token',
    })

    expect(result).toMatchObject({
      source: 'server',
      platform: 'woocommerce',
      mode: 'bundle',
      subtotal: 200,
    })
    expect(wooFactsMock).toHaveBeenCalledTimes(2)
  })
})
