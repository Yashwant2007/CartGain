import { mapShopifyStatus, shopifyBillingTestMode } from '../subscriptions'
import { createShopifySubscription } from '../subscriptions'
import { shopifyGraphQL } from '../client'

jest.mock('../client', () => ({
  shopifyGraphQL: jest.fn(),
  assertNoUserErrors: jest.fn((errors: Array<{ message: string }> | undefined, context: string) => {
    if (errors?.length) throw new Error(`${context}: ${errors.map((error) => error.message).join('; ')}`)
  }),
  isShopifyAuthFailure: jest.fn(() => false),
  ShopifyReconnectRequiredError: class ShopifyReconnectRequiredError extends Error {},
}))

describe('mapShopifyStatus', () => {
  it('maps ACTIVE → active', () => {
    expect(mapShopifyStatus('ACTIVE')).toBe('active')
    expect(mapShopifyStatus('active')).toBe('active')
  })

  it('maps PENDING → pending', () => {
    expect(mapShopifyStatus('PENDING')).toBe('pending')
  })

  it('maps FROZEN → paused', () => {
    expect(mapShopifyStatus('FROZEN')).toBe('paused')
  })

  it('maps CANCELLED/DECLINED/EXPIRED → cancelled', () => {
    expect(mapShopifyStatus('CANCELLED')).toBe('cancelled')
    expect(mapShopifyStatus('DECLINED')).toBe('cancelled')
    expect(mapShopifyStatus('EXPIRED')).toBe('cancelled')
  })

  it('defaults unknown statuses to cancelled', () => {
    expect(mapShopifyStatus(null)).toBe('cancelled')
    expect(mapShopifyStatus(undefined)).toBe('cancelled')
    expect(mapShopifyStatus('UNKNOWN')).toBe('cancelled')
    expect(mapShopifyStatus('')).toBe('cancelled')
  })
})

describe('shopifyBillingTestMode', () => {
  const originalFlag = process.env.SHOPIFY_BILLING_TEST
  const originalVercelEnv = process.env.VERCEL_ENV

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.SHOPIFY_BILLING_TEST
    else process.env.SHOPIFY_BILLING_TEST = originalFlag
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = originalVercelEnv
  })

  it('allows test charges off production when the flag is set', () => {
    process.env.SHOPIFY_BILLING_TEST = 'true'
    delete process.env.VERCEL_ENV
    expect(shopifyBillingTestMode()).toBe(true)
  })

  it('never enables test charges in production even if the flag leaks', () => {
    process.env.SHOPIFY_BILLING_TEST = 'true'
    process.env.VERCEL_ENV = 'production'
    expect(shopifyBillingTestMode()).toBe(false)
  })

  it('is off when the flag is absent', () => {
    delete process.env.SHOPIFY_BILLING_TEST
    delete process.env.VERCEL_ENV
    expect(shopifyBillingTestMode()).toBe(false)
  })
})

describe('createShopifySubscription', () => {
  beforeEach(() => jest.clearAllMocks())

  it('asks Shopify to apply its standard replacement rules in the creation mutation', async () => {
    ;(shopifyGraphQL as jest.Mock).mockResolvedValue({
      errors: [],
      data: {
        appSubscriptionCreate: {
          appSubscription: { id: 'gid://shopify/AppSubscription/new', status: 'PENDING' },
          confirmationUrl: 'https://example.myshopify.com/approve',
          userErrors: [],
        },
      },
    })

    const result = await createShopifySubscription({
      store: {
        id: 'store-1',
        domain: 'example.myshopify.com',
        apiKey: 'encrypted',
        shopifyRefreshToken: 'encrypted-refresh',
        shopifyTokenExpiresAt: new Date(Date.now() + 60_000),
      },
      planName: 'CartGain Growth (monthly)',
      amount: 1499,
      currency: 'INR',
      period: 'monthly',
      returnUrl: 'https://cart-gain.com/dashboard/subscription',
    })

    expect(result.confirmationUrl).toBe('https://example.myshopify.com/approve')
    expect(shopifyGraphQL).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'example.myshopify.com' }),
      expect.stringContaining('replacementBehavior: $replacementBehavior'),
      expect.objectContaining({ replacementBehavior: 'STANDARD' }),
    )
  })
})
