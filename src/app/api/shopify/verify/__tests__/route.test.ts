import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import prisma from '@/lib/db'
import { getAccessToken, shopifyGraphQL, ShopifyReconnectRequiredError } from '@/lib/shopify'
import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
import { GET, POST } from '@/app/api/shopify/verify/route'
import type { ShopifyVerificationGraphqlData } from '@/lib/shopify/verification'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { store: { findFirst: jest.fn() } },
}))

jest.mock('@/lib/shopify', () => {
  class ShopifyReconnectRequiredError extends Error {
    constructor(message = 'reconnect required') {
      super(message)
      this.name = 'ShopifyReconnectRequiredError'
    }
  }
  return {
    shopifyGraphQL: jest.fn(),
    getAccessToken: jest.fn(),
    ShopifyReconnectRequiredError,
  }
})

jest.mock('@/lib/shopify-graphql', () => ({
  queryShopifyGraphQL: jest.fn(),
}))

const authMock = getServerSession as jest.Mock
const storeMock = prisma.store.findFirst as jest.Mock
const graphqlMock = shopifyGraphQL as jest.Mock
const tokenMock = getAccessToken as jest.Mock
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
    shop: { id: 'gid://shopify/Shop/1', name: 'Example Shop', myshopifyDomain: STORE.domain },
    currentAppInstallation: {
      id: 'gid://shopify/AppInstallation/1',
      accessScopes: [
        { handle: 'read_orders' },
        { handle: 'read_customers' },
        { handle: 'read_products' },
        { handle: 'write_discounts' },
      ],
      activeSubscriptions: [
        {
          id: 'gid://shopify/AppSubscription/1',
          name: 'Growth',
          status: 'ACTIVE',
          currentPeriodEnd: '2026-12-01T00:00:00.000Z',
          lineItems: [{ id: 'gid://shopify/AppSubscriptionLineItem/1' }],
        },
      ],
      allSubscriptions: {
        nodes: [
          {
            id: 'gid://shopify/AppSubscription/2',
            name: 'Starter',
            status: 'CANCELLED',
            currentPeriodEnd: '2026-01-01T00:00:00.000Z',
            createdAt: '2025-12-01T00:00:00.000Z',
          },
        ],
      },
    },
  }
}

function postRequest(body: Record<string, unknown> | null) {
  return new NextRequest('https://cart-gain.com/api/shopify/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  })
}

function expectReadOnly() {
  const queries = [
    ...graphqlMock.mock.calls.map((call) => call[1] as string),
    ...lookupMock.mock.calls.map((call) => call[2] as string),
  ]
  for (const query of queries) {
    const lowered = query.toLowerCase()
    for (const marker of MUTATION_MARKERS) {
      expect(lowered).not.toContain(marker.toLowerCase())
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  storeMock.mockResolvedValue(STORE)
  tokenMock.mockResolvedValue('test-token')
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

it('authenticates the merchant and returns normalized verification data on GET', async () => {
  const response = await GET()
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(authMock).toHaveBeenCalledTimes(1)
  expect(storeMock).toHaveBeenCalledWith({
    where: { userId: 'user-1', platform: 'shopify' },
  })
  expect(body.connected).toBe(true)
  expect(body.requestedScopes).toContain('read_orders')
  expect(body.grantedScopes).toEqual([
    'read_orders',
    'read_customers',
    'read_products',
    'write_discounts',
  ])
  expect(body.missingScopes).toEqual([])
  expect(body.activeSubscriptions[0].lineItemIds).toEqual(['gid://shopify/AppSubscriptionLineItem/1'])
  expect(body.allSubscriptions[0].rawStatus).toBe('CANCELLED')
  expect(body.verification.shop.domain).toBe(STORE.domain)
  expect(lookupMock).not.toHaveBeenCalled()
  expectReadOnly()
})

it('uses the existing discount lookup when POST supplies a code', async () => {
  const response = await POST(postRequest({ code: 'GAIN123' }))
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(lookupMock).toHaveBeenCalledWith(
    STORE.domain,
    'test-token',
    expect.any(String),
    { query: 'GAIN123' },
  )
  expect(body.discountCode).toEqual({
    code: 'GAIN123',
    verified: true,
    discountNodeId: 'gid://shopify/DiscountCodeNode/1',
    endsAt: '2099-01-01T00:00:00.000Z',
  })
  expect(JSON.stringify(body)).not.toContain('encrypted-token-value')
  expect(JSON.stringify(body)).not.toContain('test-token')
  expectReadOnly()
})

it('behaves like GET when POST has no code', async () => {
  const response = await POST(postRequest({}))
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body.connected).toBe(true)
  expect(body.discountCode).toBeNull()
  expect(lookupMock).not.toHaveBeenCalled()
  expectReadOnly()
})

it('rejects unauthenticated merchants before any Shopify call', async () => {
  authMock.mockResolvedValue(null)

  expect((await GET()).status).toBe(401)
  expect((await POST(postRequest({ code: 'GAIN123' }))).status).toBe(401)
  expect(graphqlMock).not.toHaveBeenCalled()
  expect(lookupMock).not.toHaveBeenCalled()
})

it('returns the reconnect error shape when the store has no token', async () => {
  storeMock.mockResolvedValue({ ...STORE, apiKey: null })
  const response = await GET()
  const body = await response.json()

  expect(body).toMatchObject({
    connected: false,
    reauthRequired: true,
    code: 'SHOPIFY_RECONNECT_REQUIRED',
  })
  expect(body.error).toContain('Reconnect the store')
  expect(graphqlMock).not.toHaveBeenCalled()
})

it('returns the reconnect error shape when Shopify requires reconnection', async () => {
  graphqlMock.mockRejectedValue(new ShopifyReconnectRequiredError())
  const response = await GET()
  const body = await response.json()

  expect(body).toMatchObject({
    connected: false,
    reauthRequired: true,
    code: 'SHOPIFY_RECONNECT_REQUIRED',
  })
  expect(body.error).toContain('Reconnect the store')
})
