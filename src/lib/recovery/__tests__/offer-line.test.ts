import { buildRecoveryOfferLine } from '../offer-line'

describe('buildRecoveryOfferLine', () => {
  it('fills name, product, price, discount, code in punchy order', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: 'Snowboard',
      discountLabel: '10% off',
      code: 'GAINABC123',
    })

    expect(line).toContain('Priya')
    expect(line).toContain('Snowboard')
    expect(line).toContain('10% off')
    expect(line).toContain('code GAINABC123')
    expect(line).toContain('is waiting 🛒')
    expect(line).toContain('Still yours — claim it now!')
    expect(line.indexOf('claim it now!')).toBeGreaterThan(line.indexOf('Snowboard'))
  })

  it('keeps a live link when there is no discount', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: 'Snowboard',
    })

    expect(line).toContain('is waiting 🛒')
    expect(line).toContain('claim it now!')
    expect(line).not.toContain('Use ')
    expect(line).not.toContain('code ')
  })

  it('collapses whitespace and newlines so the template body stays one line', () => {
    const line = buildRecoveryOfferLine({
      firstName: '  Priya  ',
      productSummary: 'Snowboard\n  and bindings',
      discountLabel: '10%   off',
      code: ' GAINABC123 ',
    })

    expect(line).not.toMatch(/\s{2,}/)
    expect(line).not.toContain('\n')
    expect(line).toContain('Snowboard and bindings')
  })

  it('never truncates product names', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: `${'Very long product name '.repeat(40)}Snowboard`,
      discountLabel: '10% off',
      code: 'GAINABC123',
    })

    expect(line).toContain('claim it now!')
    expect(line.length).toBeLessThan(700)
  })

  it('still produces a non-empty line when every descriptive field is missing', () => {
    const line = buildRecoveryOfferLine({})
    expect(line).toContain('is waiting 🛒')
    expect(line).toContain('claim it now!')
  })

  it('includes product price and qty when provided', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: 'Snowboard',
      productPrice: 299,
      productQty: 2,
      discountLabel: '10% off',
      code: 'GAINABC123',
    })

    expect(line).toContain('299.00')
    expect(line).toContain('× 2')
  })

  it('uses fallback "your cart" when product summary is empty', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: '',
    })

    expect(line).toContain('your cart is waiting 🛒')
  })

  it('names the merchant store from real store data', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      storeName: '  CartGaintest  ',
      productSummary: 'Snowboard',
    })

    expect(line).toContain('your Snowboard at CartGaintest is waiting 🛒')
  })

  it('uses classy CTA labels on the checkout and bargain links', () => {
    const checkout = buildRecoveryOfferLine({
      productSummary: 'Snowboard',
      linkType: 'checkout',
      linkUrl: 'https://cart-gain.com/r/abc',
    })
    const bargain = buildRecoveryOfferLine({
      productSummary: 'Snowboard',
      linkType: 'bargain',
      linkUrl: 'https://cart-gain.com/r/def',
    })

    expect(checkout).toContain('🛒 Complete your order: https://cart-gain.com/r/abc')
    expect(bargain).toContain('💬 Name your price: https://cart-gain.com/r/def')
  })

  it('omits inline links when the template button carries the CTA', () => {
    const line = buildRecoveryOfferLine({
      productSummary: 'Snowboard',
      linkType: 'checkout',
      linkUrl: 'https://cart-gain.com/r/abc',
      includeLink: false,
    })

    expect(line).toContain('claim it now!')
    expect(line).not.toContain('https://')
  })
})
