import prisma from '@/lib/db'
import {
  fetchAbandonedCheckoutsDetailed,
  syncAbandonedCheckouts,
} from '@/lib/shopify'

jest.mock('@/lib/encryption', () => ({
  decrypt: (value: string) => value,
  encrypt: (value: string) => value,
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn() }))
jest.mock('@/lib/data-protection', () => ({ logDataAccess: jest.fn() }))
jest.mock('@/lib/alerter', () => ({ sendAlert: jest.fn() }))

const storeUpdate = prisma.store.update as jest.Mock

const store = {
  id: 's1',
  domain: 'shop.myshopify.com',
  apiKey: 'token',
  shopifyRefreshToken: 'refresh',
  shopifyTokenExpiresAt: new Date(Date.now() + 1_000_000),
  userId: 'u1',
  abandonedCheckoutUrlAccess: 'ACCESS_DENIED',
  abandonedCheckoutUrlCheckedAt: new Date(Date.now() - 60_000),
}

function graphqlResponse(data: unknown, errors?: Array<{ message: string }>) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data, errors }),
  }
}

function coreData() {
  return {
    abandonedCheckouts: {
      nodes: [
        {
          id: 'gid://shopify/AbandonedCheckout/1',
          completedAt: null,
          createdAt: new Date().toISOString(),
          totalPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
          customer: null,
          billingAddress: null,
          shippingAddress: null,
          lineItems: { nodes: [] },
        },
      ],
    },
  }
}

describe('abandoned checkout URL capability cache', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    storeUpdate.mockResolvedValue({})
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('skips the protected URL query while a denial is fresh', async () => {
    const fetchMock = jest.fn(async () => graphqlResponse(coreData()))
    global.fetch = fetchMock as any

    const result = await fetchAbandonedCheckoutsDetailed(store)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.urlAccess).toBe('ACCESS_DENIED')
    expect(result.urlStatusCounts).toEqual({ ACCESS_DENIED: 1 })
    expect(result.deniedReason).toBeUndefined()
  })

  it('re-probes an expired denial and reports the protected field denial', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(graphqlResponse(coreData()))
      .mockResolvedValueOnce(graphqlResponse(null, [{ message: 'ACCESS_DENIED: protected customer data not approved' }]))
    global.fetch = fetchMock as any

    const result = await fetchAbandonedCheckoutsDetailed({
      ...store,
      abandonedCheckoutUrlCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(body.query).toContain('abandonedCheckoutUrl')
    expect(result.urlAccess).toBe('ACCESS_DENIED')
    expect(result.deniedReason).toBe('ACCESS_DENIED')
  })

  it('refreshes the denial timestamp when a cached denial is confirmed again', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(graphqlResponse(coreData()))
      .mockResolvedValueOnce(graphqlResponse(null, [{ message: 'ACCESS_DENIED: protected customer data not approved' }]))
    global.fetch = fetchMock as any

    await syncAbandonedCheckouts({
      ...store,
      abandonedCheckoutUrlCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    })

    expect(storeUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        abandonedCheckoutUrlAccess: 'ACCESS_DENIED',
        abandonedCheckoutUrlCheckedAt: expect.any(Date),
      },
    })
  })
})
