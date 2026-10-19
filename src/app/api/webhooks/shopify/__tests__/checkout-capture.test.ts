/**
 * Regression: Shopify API 2026-04 removed the `id` field from the
 * `checkouts/create` and `checkouts/update` webhook payloads — only `token`
 * remains. The handler used to bail out unless BOTH were present, so every
 * checkout webhook was dropped and no customer email/phone was ever captured.
 * With no contact, the recovery pipeline can never send an email or WhatsApp
 * message. These tests drive the real POST handler (with a valid HMAC) and
 * assert the checkout is stored against its token with contact + total.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'

const SECRET = 'shpss_checkout_capture_secret'

const mockStoreFindFirst = jest.fn()
const mockCartUpsert = jest.fn()
let mockPending: Promise<unknown>[] = []

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: (...args: any[]) => mockStoreFindFirst(...args) },
    cart: { upsert: (...args: any[]) => mockCartUpsert(...args) },
  },
}))
jest.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    mockPending.push(p)
  },
}))
jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined),
  redactSensitive: (v: unknown) => v,
}))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn() }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/alerter', () => ({ sendAlertOnError: jest.fn() }))

const STORE = { id: 'store-1', userId: 'user-1', domain: 'cartgain.myshopify.com' }

function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('base64')
}

function delivery(topic: string, payload: unknown, domain = 'cartgain.myshopify.com'): NextRequest {
  const body = JSON.stringify(payload)
  const headers = new Headers({
    'content-type': 'application/json',
    'x-shopify-topic': topic,
    'x-shopify-shop-domain': domain,
    'x-shopify-webhook-id': `wh-${topic}-1`,
    'x-shopify-hmac-sha256': sign(body),
  })
  return new NextRequest('https://cart-gain.com/api/webhooks/shopify', { method: 'POST', headers, body })
}

async function post(req: NextRequest) {
  const { POST } = await import('@/app/api/webhooks/shopify/route')
  return POST(req)
}

const ORIGINAL = process.env.SHOPIFY_API_SECRET

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET
  jest.resetModules()
  mockPending = []
  mockStoreFindFirst.mockReset().mockResolvedValue(STORE)
  mockCartUpsert.mockReset().mockResolvedValue({})
})
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SHOPIFY_API_SECRET
  else process.env.SHOPIFY_API_SECRET = ORIGINAL
})

describe('checkout webhook capture (Shopify 2026-04 has no `id`)', () => {
  it('stores a checkouts/create payload by `token` and captures contact + total', async () => {
    const res = await post(
      delivery('checkouts/create', {
        // NOTE: no `id` — matches the 2026-04 payload.
        token: 'checkout-token-abc',
        email: 'buyer@example.com',
        phone: '+919876543210',
        currency: 'INR',
        total_price: '1299.00',
        customer: { id: 55, first_name: 'Asha', last_name: 'Rao' },
        line_items: [{ title: 'Silk Saree', variant_title: 'Red', price: '1299.00', quantity: 1 }],
      }),
    )
    expect(res.status).toBe(200)
    await Promise.all(mockPending)

    expect(mockCartUpsert).toHaveBeenCalledTimes(1)
    const arg = mockCartUpsert.mock.calls[0][0]
    expect(arg.where.storeId_cartId).toEqual({ storeId: STORE.id, cartId: 'checkout-token-abc' })
    expect(arg.create.customerEmail).toBe('buyer@example.com')
    expect(arg.create.customerPhone).toBe('+919876543210')
    expect(arg.create.customerName).toBe('Asha Rao')
    expect(arg.create.totalValue).toBe(1299)
    expect(arg.create.items[0].name).toBe('Silk Saree')
  })

  it('captures a contact email carried on customer.email when email is absent', async () => {
    await post(
      delivery('checkouts/update', {
        token: 'checkout-token-xyz',
        total_price: '500',
        customer: { id: 9, email: 'nested@example.com' },
        line_items: [{ title: 'Mug', price: '500', quantity: 1 }],
      }),
    )
    await Promise.all(mockPending)
    expect(mockCartUpsert.mock.calls[0][0].create.customerEmail).toBe('nested@example.com')
  })

  it('falls back to summing line items when total_price is missing', async () => {
    await post(
      delivery('carts/update', {
        id: 123,
        token: 'cart-token-1',
        line_items: [
          { title: 'A', price: '100', quantity: 2 },
          { title: 'B', price: '50', quantity: 1 },
        ],
      }),
    )
    await Promise.all(mockPending)
    expect(mockCartUpsert.mock.calls[0][0].create.totalValue).toBe(250)
  })

  it('ignores a payload with no token at all', async () => {
    await post(delivery('checkouts/create', { email: 'x@example.com', line_items: [] }))
    await Promise.all(mockPending)
    expect(mockCartUpsert).not.toHaveBeenCalled()
  })
})
