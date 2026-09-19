import crypto from 'crypto'
import { verifyShopifyWebhook } from '@/lib/shopify'

function makeHeaders(headers: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(headers)) h.set(k, v)
  return h
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('verifyShopifyWebhook — HMAC signatures', () => {
  const secret = 'shpss_test_secret'
  const original = process.env.SHOPIFY_API_SECRET
  afterEach(() => {
    if (original === undefined) delete process.env.SHOPIFY_API_SECRET
    else process.env.SHOPIFY_API_SECRET = original
  })

  it('accepts a payload signed with the correct secret', () => {
    process.env.SHOPIFY_API_SECRET = secret
    const body = JSON.stringify({ shop_id: 1, shop_domain: 'demo.myshopify.com', customer: { id: '123' } })
    const signature = sign(body, secret)
    expect(verifyShopifyWebhook(body, makeHeaders({ 'x-shopify-hmac-sha256': signature }))).toBe(true)
  })

  it('rejects a payload signed with the WRONG secret (secret mismatch → webhook rejected)', () => {
    process.env.SHOPIFY_API_SECRET = secret
    const body = JSON.stringify({ id: 1 })
    const signature = sign(body, 'some_other_secret')
    expect(verifyShopifyWebhook(body, makeHeaders({ 'x-shopify-hmac-sha256': signature }))).toBe(false)
  })

  it('rejects without the hmac header', () => {
    process.env.SHOPIFY_API_SECRET = secret
    expect(verifyShopifyWebhook('{"id":1}', makeHeaders({}))).toBe(false)
  })

  it('rejects when the secret is not configured', () => {
    delete process.env.SHOPIFY_API_SECRET
    const signature = sign('{"id":1}', secret)
    expect(verifyShopifyWebhook('{"id":1}', makeHeaders({ 'x-shopify-hmac-sha256': signature }))).toBe(false)
  })

  it('rejects a tampered body even with a valid-looking signature', () => {
    process.env.SHOPIFY_API_SECRET = secret
    const signature = sign('{"id":1}', secret)
    expect(verifyShopifyWebhook('{"id":2}', makeHeaders({ 'x-shopify-hmac-sha256': signature }))).toBe(false)
  })
})