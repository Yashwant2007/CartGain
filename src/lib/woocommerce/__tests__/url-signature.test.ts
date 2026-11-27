import {
  assertPublicHttpsUrl,
  isPrivateAddress,
  normalizeStoreUrl,
  parseStoreUrl,
  UnsafeStoreUrlError,
  type DnsLookup,
} from '../url'
import {
  buildConnectionProof,
  credentialFingerprint,
  deriveWebhookSecret,
  signPluginRequest,
  signWebhookPayload,
  verifyPluginRequest,
  verifyWebhookSignature,
} from '../signature'

describe('WooCommerce store URL validation', () => {
  it('normalizes a public HTTPS store URL', () => {
    expect(normalizeStoreUrl('https://Shop.Example.com/store/')).toBe('https://shop.example.com/store')
  })

  it.each([
    'http://shop.example.com',
    'https://user:pass@shop.example.com',
    'https://shop.example.com:8443',
    'https://shop.example.com/?x=1',
    'https://shop.example.com/#x',
    'https://localhost',
    'https://shop.local',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://[::1]',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => parseStoreUrl(url)).toThrow(UnsafeStoreUrlError)
  })

  it('rejects private DNS answers but accepts public ones', async () => {
    const publicLookup: DnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]
    const privateLookup: DnsLookup = async () => [{ address: '10.0.0.5', family: 4 }]

    await expect(assertPublicHttpsUrl('https://shop.example.com', publicLookup)).resolves.toBe(
      'https://shop.example.com',
    )
    await expect(assertPublicHttpsUrl('https://shop.example.com', privateLookup)).rejects.toThrow(
      /private address/,
    )
  })

  it('recognizes private address ranges', () => {
    expect(isPrivateAddress('192.168.1.1')).toBe(true)
    expect(isPrivateAddress('172.20.1.1')).toBe(true)
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
  })
})

describe('WooCommerce webhook signatures', () => {
  const secret = 'webhook-secret'
  const timestamp = '1700000000'
  const rawBody = '{"eventId":"evt-12345678","type":"cart_abandoned","data":{}}'

  it('accepts a valid signature with or without the sha256 prefix', () => {
    const signature = signWebhookPayload(secret, timestamp, rawBody)
    expect(verifyWebhookSignature({ rawBody, signature, timestamp, secret, now: 1700000000000 })).toBe(true)
    expect(
      verifyWebhookSignature({ rawBody, signature: `sha256=${signature.toUpperCase()}`, timestamp, secret, now: 1700000000000 }),
    ).toBe(true)
  })

  it('rejects tampered bodies, stale timestamps, and malformed signatures', () => {
    const signature = signWebhookPayload(secret, timestamp, rawBody)
    expect(
      verifyWebhookSignature({ rawBody: `${rawBody} `, signature, timestamp, secret, now: 1700000000000 }),
    ).toBe(false)
    expect(verifyWebhookSignature({ rawBody, signature, timestamp, secret, now: 1700000300001 })).toBe(false)
    expect(verifyWebhookSignature({ rawBody, signature: 'abc', timestamp, secret, now: 1700000000000 })).toBe(false)
    expect(verifyWebhookSignature({ rawBody, signature, timestamp: 'not-a-timestamp', secret, now: 1700000000000 })).toBe(false)
  })

  it('derives stable proof, webhook secret, and credential fingerprint without returning inputs', () => {
    const input = { code: 'code-123', installId: 'install-1', storeUrl: 'https://shop.example.com/' }
    expect(buildConnectionProof(input)).toBe(buildConnectionProof({ ...input, storeUrl: 'https://shop.example.com' }))
    expect(buildConnectionProof({ ...input, installId: 'install-2' })).not.toBe(buildConnectionProof(input))
    expect(deriveWebhookSecret({ ...input, consumerSecret: 's1' })).toBe(
      deriveWebhookSecret({ ...input, consumerSecret: 's1' }),
    )
    expect(deriveWebhookSecret({ ...input, consumerSecret: 's1' })).not.toBe(
      deriveWebhookSecret({ ...input, consumerSecret: 's2' }),
    )
    expect(credentialFingerprint('consumer-key')).toHaveLength(16)
  })
})

describe('WooCommerce plugin request signatures', () => {
  const secret = 'plugin-secret'
  const timestamp = '1700000000'
  const storeId = 'store-123'
  const rawBody = JSON.stringify({ type: 'store_api_cart', payload: { cartToken: 'token-1' } })

  it('accepts a valid raw-body signature with or without the sha256 prefix', () => {
    const signature = signPluginRequest(secret, timestamp, rawBody)
    expect(
      verifyPluginRequest({
        rawBody,
        signature,
        timestamp,
        storeId,
        secret,
        now: 1700000000000,
      }),
    ).toBe(true)
    expect(
      verifyPluginRequest({
        rawBody,
        signature: `sha256=${signature.toUpperCase()}`,
        timestamp,
        storeId,
        secret,
        now: 1700000000000,
      }),
    ).toBe(true)
  })

  it('rejects tampered bodies, missing store headers, stale timestamps, and malformed signatures', () => {
    const signature = signPluginRequest(secret, timestamp, rawBody)
    const input = {
      rawBody,
      signature,
      timestamp,
      storeId,
      secret,
      now: 1700000000000,
    }
    expect(verifyPluginRequest({ ...input, rawBody: `${rawBody} ` })).toBe(false)
    expect(verifyPluginRequest({ ...input, storeId: null })).toBe(false)
    expect(verifyPluginRequest({ ...input, now: 1700000300001 })).toBe(false)
    expect(verifyPluginRequest({ ...input, signature: 'abc' })).toBe(false)
  })
})
