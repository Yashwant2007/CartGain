jest.mock('@/lib/shopify', () => ({ getAccessToken: jest.fn() }))
jest.mock('@/lib/shopify-graphql', () => ({ queryShopifyGraphQL: jest.fn() }))

import { getAccessToken } from '@/lib/shopify'
import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
import { buildRecoveryCode, resolveRecoveryOffer } from '../offer'

const getAccessTokenMock = getAccessToken as jest.Mock
const graphqlMock = queryShopifyGraphQL as jest.Mock

const store = {
  id: 'store_1',
  domain: 'shop.myshopify.com',
  apiKey: 'key',
  shopifyRefreshToken: null,
  shopifyTokenExpiresAt: null,
}

const campaign = (overrides: Record<string, unknown> = {}) => ({
  discountEnabled: true,
  discountType: 'percentage',
  discountValue: 10,
  discountCode: null,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  getAccessTokenMock.mockResolvedValue('token')
  graphqlMock.mockResolvedValue({ discountCodeBasicCreate: { userErrors: [] } })
})

describe('resolveRecoveryOffer', () => {
  it('returns no offer when the merchant disabled discounts', async () => {
    const offer = await resolveRecoveryOffer({
      campaign: campaign({ discountEnabled: false }),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(offer).toBeNull()
    expect(graphqlMock).not.toHaveBeenCalled()
  })

  it('returns no offer when the configured value is invalid', async () => {
    const offer = await resolveRecoveryOffer({
      campaign: campaign({ discountValue: 0 }),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(offer).toBeNull()
  })

  it('uses the merchant code as-is and never mints another', async () => {
    const offer = await resolveRecoveryOffer({
      campaign: campaign({ discountCode: 'SAVE10' }),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(offer).toEqual({ code: 'SAVE10', value: 10, type: 'percentage', source: 'campaign' })
    expect(graphqlMock).not.toHaveBeenCalled()
  })

  it('mints a real single-use Shopify code when the campaign has none', async () => {
    const offer = await resolveRecoveryOffer({
      campaign: campaign({ discountValue: 15 }),
      store,
      cartId: 'cart_1',
      cartTotal: 1200,
    })

    expect(offer).toEqual({
      code: buildRecoveryCode('cart_1'),
      value: 15,
      type: 'percentage',
      source: 'minted',
    })

    const [, , query, variables] = graphqlMock.mock.calls[0]
    expect(query).toContain('discountCodeBasicCreate')
    expect(variables.basicCodeDiscount).toMatchObject({
      code: buildRecoveryCode('cart_1'),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      value: { percentage: 15 },
      minimumSubtotal: 1200,
    })
  })

  it('is deterministic per cart so retries cannot create duplicate codes', async () => {
    const first = await resolveRecoveryOffer({
      campaign: campaign(),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    const second = await resolveRecoveryOffer({
      campaign: campaign(),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(first?.code).toBe(second?.code)
  })

  it('treats "already exists" as success (retry-safe)', async () => {
    graphqlMock.mockResolvedValue({
      discountCodeBasicCreate: {
        userErrors: [{ field: ['code'], message: 'Code is already in use', code: 'TAKEN' }],
      },
    })
    const offer = await resolveRecoveryOffer({
      campaign: campaign(),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(offer?.source).toBe('minted')
  })

  it('sends NO offer when Shopify rejects the code', async () => {
    graphqlMock.mockResolvedValue({
      discountCodeBasicCreate: { userErrors: [{ message: 'Invalid value' }] },
    })
    const offer = await resolveRecoveryOffer({
      campaign: campaign(),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(offer).toBeNull()
  })

  it('sends NO offer when the store is not connected', async () => {
    getAccessTokenMock.mockResolvedValue(null)
    const offer = await resolveRecoveryOffer({
      campaign: campaign(),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    expect(offer).toBeNull()
  })

  it('clamps an absurd percentage instead of creating it', async () => {
    await resolveRecoveryOffer({
      campaign: campaign({ discountValue: 500 }),
      store,
      cartId: 'cart_1',
      cartTotal: 100,
    })
    const [, , , variables] = graphqlMock.mock.calls[0]
    expect(variables.basicCodeDiscount.value.percentage).toBe(90)
  })

  it('supports fixed-amount offers', async () => {
    await resolveRecoveryOffer({
      campaign: campaign({ discountType: 'fixed', discountValue: 25 }),
      store,
      cartId: 'cart_1',
      cartTotal: 200,
    })
    const [, , , variables] = graphqlMock.mock.calls[0]
    expect(variables.basicCodeDiscount.value).toEqual({
      discountAmount: { amount: 25, appliesOnEachItem: false },
    })
  })
})
