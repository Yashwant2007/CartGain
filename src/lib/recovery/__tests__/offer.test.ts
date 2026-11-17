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

const activeNode = (code: string) => ({
  id: 'gid://shopify/DiscountCodeNode/1',
  codeDiscount: {
    status: 'ACTIVE',
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    usageLimit: 1,
    codes: { nodes: [{ code }] },
  },
})

const mockCreate = () => {
  getAccessTokenMock.mockResolvedValue('token')
  graphqlMock.mockImplementation((_shop: string, _token: string, query: string, variables: any) => {
    if (query.includes('discountCodeBasicCreate')) {
      return Promise.resolve({
        discountCodeBasicCreate: {
          userErrors: [],
          codeDiscountNode: activeNode(variables.basicCodeDiscount.code),
        },
      })
    }
    if (query.includes('discountCodeLookup')) {
      return Promise.resolve({ codeDiscountNodes: { nodes: [activeNode(variables.query)] } })
    }
    return Promise.resolve({})
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreate()
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
      context: { all: 'ALL' },
      customerGets: {
        value: { percentage: 0.15 },
        items: { all: true },
      },
      minimumRequirement: {
        subtotal: { greaterThanOrEqualToSubtotal: '1200.00' },
      },
    })
    expect(variables.basicCodeDiscount).not.toHaveProperty('customerSelection')
    expect(variables.basicCodeDiscount).not.toHaveProperty('value')
    expect(variables.basicCodeDiscount).not.toHaveProperty('minimumSubtotal')
    expect(variables.basicCodeDiscount).not.toHaveProperty('summary')
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

  it('treats "already exists" as success when readback confirms the code', async () => {
    graphqlMock.mockImplementation((_shop: string, _token: string, query: string, variables: any) => {
      if (query.includes('discountCodeBasicCreate')) {
        return Promise.resolve({
          discountCodeBasicCreate: {
            userErrors: [{ field: ['code'], message: 'Code is already in use', code: 'TAKEN' }],
          },
        })
      }
      if (query.includes('discountCodeLookup')) {
        return Promise.resolve({ codeDiscountNodes: { nodes: [activeNode(variables.query)] } })
      }
      return Promise.resolve({})
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
    expect(variables.basicCodeDiscount.customerGets.value.percentage).toBe(0.9)
  })

  it('supports fixed-amount offers', async () => {
    await resolveRecoveryOffer({
      campaign: campaign({ discountType: 'fixed', discountValue: 25 }),
      store,
      cartId: 'cart_1',
      cartTotal: 200,
    })
    const [, , , variables] = graphqlMock.mock.calls[0]
    expect(variables.basicCodeDiscount.customerGets.value).toEqual({
      discountAmount: { amount: '25.00', appliesOnEachItem: false },
    })
  })
})
