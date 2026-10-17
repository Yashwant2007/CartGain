import { storeUpdateSchema } from '@/lib/validation'

// The store domain is merchant-settable and every server-side Shopify call is
// built from it (https://${domain}/admin/...). A private/local host or IP
// literal there would turn the app into an SSRF proxy that forwards a live
// access token, so the schema must reject those.
describe('storeUpdateSchema — domain validation', () => {
  const parse = (domain: string) => storeUpdateSchema.safeParse({ domain })

  it('accepts public hostnames and myshopify hosts', () => {
    expect(parse('mystore.myshopify.com').success).toBe(true)
    expect(parse('shop.example.co.uk').success).toBe(true)
    expect(parse('https://mystore.com').success).toBe(true)
    expect(parse('https://mystore.com/some/path').success).toBe(true)
  })

  it('allows an empty domain (not set)', () => {
    expect(parse('').success).toBe(true)
  })

  it('rejects localhost and private/internal hosts', () => {
    for (const domain of [
      'localhost',
      'http://localhost:3000',
      'mystore.local',
      'api.internal',
      'metadata.google.internal',
      'service.home.arpa',
    ]) {
      expect(parse(domain).success).toBe(false)
    }
  })

  it('rejects IP literals (including cloud metadata)', () => {
    for (const domain of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.169.254',
      '0.0.0.0',
      'http://169.254.169.254/latest/meta-data',
      '[::1]',
    ]) {
      expect(parse(domain).success).toBe(false)
    }
  })
})
