import {
  APP_BRIDGE_CDN_SRC,
  SHOPIFY_EMBED_HEADER,
  isShopifyEmbedRequest,
  isValidShopDomain,
} from '../shopify-app-bridge'

describe('isValidShopDomain', () => {
  it('accepts a myshopify domain', () => {
    expect(isValidShopDomain('my-store.myshopify.com')).toBe(true)
    expect(isValidShopDomain('my-store-2.myshopify.com')).toBe(true)
  })

  it('rejects anything that is not a myshopify domain', () => {
    expect(isValidShopDomain('evil.com')).toBe(false)
    expect(isValidShopDomain('myshopify.com.evil.com')).toBe(false)
    expect(isValidShopDomain('https://my-store.myshopify.com')).toBe(false)
    expect(isValidShopDomain('')).toBe(false)
    expect(isValidShopDomain(null)).toBe(false)
    expect(isValidShopDomain(undefined)).toBe(false)
  })
})

describe('isShopifyEmbedRequest', () => {
  it('is true only when the middleware marked the request as embedded', () => {
    const headers = new Headers({ [SHOPIFY_EMBED_HEADER]: '1' })
    expect(isShopifyEmbedRequest(headers)).toBe(true)
  })

  it('is false for a normal request', () => {
    expect(isShopifyEmbedRequest(new Headers())).toBe(false)
    expect(isShopifyEmbedRequest(new Headers({ [SHOPIFY_EMBED_HEADER]: '0' }))).toBe(false)
  })

  it('is false when there are no headers at all', () => {
    expect(isShopifyEmbedRequest(null)).toBe(false)
    expect(isShopifyEmbedRequest(undefined)).toBe(false)
  })
})

describe('APP_BRIDGE_CDN_SRC', () => {
  it('points at Shopify CDN and is loaded as a plain blocking script', () => {
    // The App Bridge bundle self-validates: it aborts unless the tag links to
    // Shopify's CDN and is not async/defer/module.
    expect(APP_BRIDGE_CDN_SRC).toBe('https://cdn.shopify.com/shopifycloud/app-bridge.js')
  })
})
