/**
 * End-to-end status-code contract for the compliance webhook handler.
 *
 * Shopify's automated check delivers a VALID, correctly signed request and
 * requires a 2xx, then delivers a FORGED one and requires 401. Anything else
 * fails the check — including 404, which is what we were returning because the
 * configured subscription URL resolved to a non-existent path.
 *
 * These tests drive the real POST handler (not just verifyShopifyWebhook) so the
 * 200 path is proven, since a valid signature cannot be forged locally against
 * the live app.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'

const SECRET = 'shpss_route_test_secret'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}))
jest.mock('@/lib/redis', () => ({ redisSetNX: jest.fn().mockResolvedValue(false) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn() }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/alerter', () => ({ sendAlertOnError: jest.fn() }))
jest.mock('@/lib/data-protection', () => ({ logDataAccess: jest.fn() }))
jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }))

const COMPLIANCE_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'] as const

function delivery(topic: string, body: string, signature: string | null) {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-shopify-topic': topic,
    'x-shopify-shop-domain': 'review-store.myshopify.com',
    'x-shopify-webhook-id': `wh-${topic}-1`,
  })
  if (signature) headers.set('x-shopify-hmac-sha256', signature)
  return new NextRequest('https://cart-gain.com/api/webhooks/shopify', {
    method: 'POST',
    headers,
    body,
  })
}

const sign = (body: string) => crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('base64')

const ORIGINAL = process.env.SHOPIFY_API_SECRET

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET
  jest.resetModules()
})
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SHOPIFY_API_SECRET
  else process.env.SHOPIFY_API_SECRET = ORIGINAL
})

async function post(req: NextRequest) {
  const { POST } = await import('@/app/api/webhooks/shopify/route')
  return POST(req)
}

describe('compliance webhook handler status contract', () => {
  for (const topic of COMPLIANCE_TOPICS) {
    it(`returns 200 for a validly signed ${topic} delivery`, async () => {
      const body = JSON.stringify({
        shop_domain: 'review-store.myshopify.com',
        shop_id: 424242,
        customer: { id: 99, email: 'shopper@example.com' },
        orders_requested: [],
      })
      const res = await post(delivery(topic, body, sign(body)))
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toMatchObject({ received: true })
    })

    it(`returns 401 for a forged ${topic} delivery`, async () => {
      const body = JSON.stringify({ shop_domain: 'review-store.myshopify.com' })
      const forged = crypto.createHmac('sha256', 'wrong_secret').update(body, 'utf8').digest('base64')
      const res = await post(delivery(topic, body, forged))
      expect(res.status).toBe(401)
    })

    it(`returns 401 for a ${topic} delivery with no signature at all`, async () => {
      const body = JSON.stringify({ shop_domain: 'review-store.myshopify.com' })
      const res = await post(delivery(topic, body, null))
      expect(res.status).toBe(401)
    })

    it(`rejects a ${topic} body that was altered after signing`, async () => {
      const signed = JSON.stringify({ shop_domain: 'review-store.myshopify.com', customer: { id: 1 } })
      const tampered = JSON.stringify({ shop_domain: 'review-store.myshopify.com', customer: { id: 999 } })
      const res = await post(delivery(topic, tampered, sign(signed)))
      expect(res.status).toBe(401)
    })
  }

  it('returns 401 rather than 500 when the app secret is missing from the environment', async () => {
    delete process.env.SHOPIFY_API_SECRET
    const body = JSON.stringify({ shop_domain: 'review-store.myshopify.com' })
    const res = await post(delivery('shop/redact', body, sign(body)))
    // Fails closed. A misconfigured secret must never 500 (Shopify treats any
    // non-2xx as a delivery failure) and must never accept the payload.
    expect(res.status).toBe(401)
  })

  it('acks a valid delivery within the review window even if the store is unknown', async () => {
    // The reviewer's test install may not exist in our DB yet. That must not
    // turn into an error response.
    const body = JSON.stringify({ shop_domain: 'brand-new-review-store.myshopify.com', shop_id: 1 })
    const res = await post(delivery('customers/data_request', body, sign(body)))
    expect(res.status).toBe(200)
  })
})
