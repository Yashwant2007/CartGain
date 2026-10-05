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
describe('verifyShopifyWebhook — secret hygiene and diagnosability', () => {
  const secret = 'shpss_trim_test_secret'
  const original = process.env.SHOPIFY_API_SECRET
  let errSpy: jest.SpyInstance

  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
    if (original === undefined) delete process.env.SHOPIFY_API_SECRET
    else process.env.SHOPIFY_API_SECRET = original
  })

  const sign = (body: string) => crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')

  it('verifies when the env secret carries a trailing newline from a dashboard paste', () => {
    // A pasted secret ending in "\n" is the single most common Vercel setup
    // mistake. It makes every delivery fail a check that looks configured.
    process.env.SHOPIFY_API_SECRET = `${secret}\n`
    const body = JSON.stringify({ id: 1 })
    expect(verifyShopifyWebhook(body, makeHeaders({ 'x-shopify-hmac-sha256': sign(body) }))).toBe(true)
  })

  it('verifies when the env secret carries surrounding whitespace', () => {
    process.env.SHOPIFY_API_SECRET = `  ${secret}  `
    const body = JSON.stringify({ id: 1 })
    expect(verifyShopifyWebhook(body, makeHeaders({ 'x-shopify-hmac-sha256': sign(body) }))).toBe(true)
  })

  it('treats a whitespace-only secret as unconfigured and says so', () => {
    process.env.SHOPIFY_API_SECRET = '   \n  '
    const body = JSON.stringify({ id: 1 })
    expect(verifyShopifyWebhook(body, makeHeaders({ 'x-shopify-hmac-sha256': sign(body) }))).toBe(false)
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('SHOPIFY_API_SECRET is not configured'))
  })

  it('logs a secret fingerprint on mismatch so the configured secret can be identified', () => {
    // Never log the secret itself — a preimage-resistant digest lets us compare
    // against the Partner Dashboard value without exposing it.
    process.env.SHOPIFY_API_SECRET = secret
    const body = JSON.stringify({ id: 1 })
    const forged = crypto.createHmac('sha256', 'someone_elses_secret').update(body, 'utf8').digest('base64')
    expect(verifyShopifyWebhook(body, makeHeaders({ 'x-shopify-hmac-sha256': forged }))).toBe(false)

    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).toContain('HMAC mismatch')
    expect(logged).toMatch(/secretFp=[0-9a-f]{16}/)
    expect(logged).not.toContain(secret)
  })
})
