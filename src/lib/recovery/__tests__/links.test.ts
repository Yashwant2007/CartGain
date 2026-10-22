import {
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
})
