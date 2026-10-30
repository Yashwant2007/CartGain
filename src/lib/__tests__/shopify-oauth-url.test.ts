import { buildShopifyOAuthUrl } from '@/lib/shopify-oauth'

describe('buildShopifyOAuthUrl', () => {
  const originalKey = process.env.SHOPIFY_API_KEY

  beforeEach(() => {
    process.env.SHOPIFY_API_KEY = 'test-key'
  })

  afterAll(() => {
    if (originalKey === undefined) delete process.env.SHOPIFY_API_KEY
    else process.env.SHOPIFY_API_KEY = originalKey
  })

  it('requests an expiring offline token that can be refreshed server-side', () => {
    const url = new URL(buildShopifyOAuthUrl({
      shop: 'test.myshopify.com',
      state: 'signed-state',
      redirectUri: 'https://cart-gain.com/api/shopify/callback',
    }))

    expect(url.searchParams.get('expiring')).toBe('1')
    expect(url.searchParams.get('grant_options[]')).toBeNull()
    expect(url.searchParams.get('state')).toBe('signed-state')
  })
})
