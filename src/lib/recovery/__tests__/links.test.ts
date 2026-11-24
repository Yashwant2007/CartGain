import {
  buildPlatformCheckoutLink,
  buildRecoveryLink,
  buildStoreCheckoutLink,
  isSafeDiscountCode,
  recoveryAppBase,
} from '../links'

describe('recovery links', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL

  afterAll(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = original
  })

  it('builds a tracked clicking link per channel', () => {
    expect(
      buildRecoveryLink({ appUrl: 'https://cart-gain.com', cartId: 'cart_1', channel: 'email' })
    ).toBe('https://cart-gain.com/r/cart_1?c=email')
  })

  it('builds the bargain variant', () => {
    expect(
      buildRecoveryLink({
        appUrl: 'https://cart-gain.com/',
        cartId: 'cart_1',
        channel: 'whatsapp',
        kind: 'bargain',
      })
    ).toBe('https://cart-gain.com/r/cart_1?c=whatsapp&to=bargain')
  })

  it('carries the code on checkout links only', () => {
    expect(
      buildRecoveryLink({
        appUrl: 'https://cart-gain.com',
        cartId: 'cart_1',
        channel: 'whatsapp',
        kind: 'checkout',
        discountCode: 'GAINABC123',
      })
    ).toBe('https://cart-gain.com/r/cart_1?c=whatsapp&to=checkout&code=GAINABC123')

    expect(
      buildRecoveryLink({
        appUrl: 'https://cart-gain.com',
        cartId: 'cart_1',
        channel: 'whatsapp',
        kind: 'bargain',
        discountCode: 'GAINABC123',
      })
    ).not.toContain('code=')
  })

  it('drops an unsafe code instead of putting it in a URL', () => {
    expect(isSafeDiscountCode('GAIN_12-3')).toBe(true)
    expect(isSafeDiscountCode('bad code')).toBe(false)
    expect(isSafeDiscountCode('javascript:alert(1)')).toBe(false)

    const link = buildRecoveryLink({
      appUrl: 'https://cart-gain.com',
      cartId: 'cart_1',
      channel: 'email',
      kind: 'checkout',
      discountCode: '<script>',
    })
    expect(link).not.toContain('code=')
  })

  it('falls back to NEXT_PUBLIC_APP_URL when no app url is passed', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://cart-gain.com/'
    expect(recoveryAppBase()).toBe('https://cart-gain.com')
  })

  it('falls back to the canonical origin when no app url is configured', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(recoveryAppBase()).toBe('https://cart-gain.com')
  })

  it('builds the store checkout with the discount applied', () => {
    expect(
      buildStoreCheckoutLink({
        domain: 'shop.myshopify.com',
        shopifyCartId: 'abc123',
        discountCode: 'GAINABC123',
      })
    ).toBe(
      'https://shop.myshopify.com/discount/GAINABC123?redirect=%2Fcart%2Fabc123'
    )
  })

  it('builds a plain cart permalink without a code', () => {
    expect(
      buildStoreCheckoutLink({ domain: 'https://shop.myshopify.com/', shopifyCartId: 'abc123' })
    ).toBe('https://shop.myshopify.com/cart/abc123')
  })

  it('falls back to the store root when the cart token is missing', () => {
    expect(buildStoreCheckoutLink({ domain: 'shop.myshopify.com' })).toBe(
      'https://shop.myshopify.com'
    )
  })

  it('never fabricates a cart path when the recovery URL was denied or invalid', () => {
    expect(
      buildStoreCheckoutLink({
        domain: 'shop.myshopify.com',
        shopifyCartId: 'cart_token_abc123',
        recoveryUrlStatus: 'ACCESS_DENIED',
      })
    ).toBe('https://shop.myshopify.com')

    expect(
      buildStoreCheckoutLink({
        domain: 'shop.myshopify.com',
        shopifyCartId: 'cart_token_abc123',
        recoveryUrlStatus: 'EXPIRED_OR_INVALID',
        discountCode: 'GAINABC123',
      })
    ).toBe('https://shop.myshopify.com/discount/GAINABC123')
  })

  it('builds a WooCommerce cart link with a coupon and product id', () => {
    expect(
      buildPlatformCheckoutLink({
        platform: 'woocommerce',
        domain: 'https://shop.example.com/',
        cartId: 'wc-cart-token',
        discountCode: 'GAINABC123',
        items: [{ productId: '42', variationId: '43' }],
      })
    ).toBe('https://shop.example.com/cart/?coupon_code=GAINABC123&product_id=43')
  })

  it('drops unsafe WooCommerce coupons and still links to the cart', () => {
    expect(
      buildPlatformCheckoutLink({
        platform: 'woocommerce',
        domain: 'shop.example.com',
        cartId: 'wc-cart-token',
        discountCode: '<script>',
      })
    ).toBe('https://shop.example.com/cart/')
  })

  it('delegates Shopify stores to the existing checkout link builder', () => {
    expect(
      buildPlatformCheckoutLink({
        platform: 'shopify',
        domain: 'shop.myshopify.com',
        cartId: 'abc123',
        discountCode: 'GAINABC123',
      })
    ).toBe('https://shop.myshopify.com/discount/GAINABC123?redirect=%2Fcart%2Fabc123')
  })
})
