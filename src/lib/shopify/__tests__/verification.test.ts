import { shopifyGraphQL } from '@/lib/shopify'
import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
import { SHOPIFY_OAUTH_SCOPES } from '@/lib/shopify-oauth'
import {
  buildShopifyVerificationQuery,
  getRequestedShopifyScopes,
  parseShopifyVerificationData,
  verifyShopifyInstallation,
  type ShopifyVerificationGraphqlData,
} from '@/lib/shopify/verification'

jest.mock('@/lib/shopify', () => ({
  shopifyGraphQL: jest.fn(),
  getAccessToken: jest.fn(async () => 'test-token'),
}))

jest.mock('@/lib/shopify-graphql', () => ({
  queryShopifyGraphQL: jest.fn(),
}))

const graphqlMock = shopifyGraphQL as jest.Mock
const lookupMock = queryShopifyGraphQL as jest.Mock

const STORE = {
  id: 'store-1',
  domain: 'example.myshopify.com',
  apiKey: 'encrypted-token-value',
  shopifyRefreshToken: 'encrypted-refresh-value',
  shopifyTokenExpiresAt: null,
}

const MUTATION_MARKERS = [
  'mutation',
  'discountCodeBasicCreate',
  'discountCodeBasicUpdate',
  'discountCodeBasicDelete',
  'appSubscriptionCreate',
  'appSubscriptionCancel',
  'appSubscriptionLineItemUpdate',
]

function verificationData(): ShopifyVerificationGraphqlData {
  return {
    shop: {
      id: 'gid://shopify/Shop/1',
      name: 'Example Shop',
      myshopifyDomain: STORE.domain,
    },
    currentAppInstallation: {
      id: 'gid://shopify/AppInstallation/1',
      accessScopes: [
        { handle: 'read_orders' },
        { handle: 'read_products' },
        { handle: 'write_discounts' },
        { handle: 'read_extra' },
      ],
      activeSubscriptions: [
        {
          id: 'gid://shopify/AppSubscription/active',
          name: 'Growth',
          status: 'ACTIVE',
          currentPeriodEnd: '2026-12-01T00:00:00.000Z',
          lineItems: [{ id: 'gid://shopify/AppSubscriptionLineItem/1' }],
        },
      ],
      allSubscriptions: {
        nodes: [
          {
            id: 'gid://shopify/AppSubscription/old',
            name: 'Starter',
            status: 'FROZEN',
            currentPeriodEnd: '2026-01-01T00:00:00.000Z',
            createdAt: '2025-12-01T00:00:00.000Z',
          },
        ],
      },
    },
  }
}

function expectReadOnly(queries: string[]) {
  for (const query of queries) {
    const lowered = query.toLowerCase()
    for (const marker of MUTATION_MARKERS) {
      expect(lowered).not.toContain(marker.toLowerCase())
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  graphqlMock.mockResolvedValue(verificationData())
  lookupMock.mockResolvedValue({
    codeDiscountNodes: {
      nodes: [
        {
          id: 'gid://shopify/DiscountCodeNode/1',
          codeDiscount: {
            status: 'ACTIVE',
            endsAt: '2099-01-01T00:00:00.000Z',
            usageLimit: 1,
            codes: { nodes: [{ code: 'GAIN123' }] },
          },
        },
      ],
    },
  })
})

it('builds a read-only verification query with every required field', () => {
  const query = buildShopifyVerificationQuery()

  expect(query).toContain('currentAppInstallation')
  expect(query).toContain('accessScopes')
  expect(query).toContain('handle')
  expect(query).toContain('activeSubscriptions')
  expect(query).toContain('currentPeriodEnd')
  expect(query).toContain('lineItems')
  expect(query).toContain('allSubscriptions(first: 10, reverse: true)')
  expect(query).toContain('createdAt')
  expectReadOnly([query])
})

it('normalizes requested, granted and missing scopes from the OAuth config', () => {
  const result = parseShopifyVerificationData(verificationData(), { shopDomain: STORE.domain })
  const expected = SHOPIFY_OAUTH_SCOPES.split(',').map((scope) => scope.trim())

  expect(getRequestedShopifyScopes()).toEqual(expected)
  expect(result.requestedScopes).toEqual(expected)
  expect(result.grantedScopes).toEqual([
    'read_orders',
    'read_products',
    'write_discounts',
    'read_extra',
  ])
  expect(result.missingScopes).toEqual(['read_customers'])
  expect(result.shop).toEqual({
    id: 'gid://shopify/Shop/1',
    name: 'Example Shop',
    domain: STORE.domain,
  })
  expect(result.appInstallationId).toBe('gid://shopify/AppInstallation/1')
})

it('normalizes active and historical subscriptions without exposing tokens', () => {
  const result = parseShopifyVerificationData(verificationData())

  expect(result.activeSubscriptions).toEqual([
    {
      id: 'gid://shopify/AppSubscription/active',
      name: 'Growth',
      status: 'active',
      rawStatus: 'ACTIVE',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      createdAt: null,
      lineItemIds: ['gid://shopify/AppSubscriptionLineItem/1'],
    },
  ])
  expect(result.allSubscriptions).toEqual([
    {
      id: 'gid://shopify/AppSubscription/old',
      name: 'Starter',
      status: 'paused',
      rawStatus: 'FROZEN',
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      createdAt: '2025-12-01T00:00:00.000Z',
      lineItemIds: [],
    },
  ])
  expect(JSON.stringify(result)).not.toContain('token')
})

it('verifies an existing discount code through the read-only lookup helper', async () => {
  const result = await verifyShopifyInstallation(STORE, { code: ' GAIN123 ' })

  expect(graphqlMock).toHaveBeenCalledWith(STORE, expect.any(String), {}, 10000)
  expect(lookupMock).toHaveBeenCalledWith(
    STORE.domain,
    'test-token',
    expect.any(String),
    { query: 'GAIN123' },
  )
  expect(result.discountCode).toEqual({
    code: 'GAIN123',
    verified: true,
    discountNodeId: 'gid://shopify/DiscountCodeNode/1',
    endsAt: '2099-01-01T00:00:00.000Z',
  })
  expectReadOnly([
    graphqlMock.mock.calls[0][1],
    lookupMock.mock.calls[0][2],
  ])
  expect(JSON.stringify(result)).not.toContain('encrypted-token-value')
  expect(JSON.stringify(result)).not.toContain('test-token')
})

it('does not look up a discount when no code is provided', async () => {
  const result = await verifyShopifyInstallation(STORE)

  expect(result.discountCode).toBeNull()
  expect(lookupMock).not.toHaveBeenCalled()
})
