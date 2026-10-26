import { buildRecoveryOfferLine } from '../offer-line'

const checkout = 'https://cart-gain.com/r/cart_1?c=whatsapp&to=checkout&code=GAINABC123'
const bargain = 'https://cart-gain.com/r/cart_1?c=whatsapp&to=bargain'

describe('buildRecoveryOfferLine', () => {
  it('fills name, product, discount, code, checkout link and bargain link in order', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: 'Snowboard',
      discountLabel: '10% off',
      code: 'GAINABC123',
      checkoutUrl: checkout,
      bargainUrl: bargain,
    })

    expect(line).toBe(
      `Priya, your Snowboard gets 10% off — code GAINABC123 — finish checkout: ${checkout} — or name your price: ${bargain}`,
    )
    expect(line.indexOf(checkout)).toBeLessThan(line.indexOf(bargain))
  })

  it('keeps a live checkout and bargain link when there is no discount', () => {
    const checkoutWithoutCode = 'https://cart-gain.com/r/cart_1?c=whatsapp&to=checkout'
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: 'Snowboard',
      checkoutUrl: checkoutWithoutCode,
      bargainUrl: bargain,
    })

    expect(line).toContain('is still saved')
    expect(line).toContain(checkoutWithoutCode)
    expect(line).toContain(bargain)
    expect(line).not.toContain(' — code ')
  })

  it('collapses whitespace and newlines so the template body stays one line', () => {
    const line = buildRecoveryOfferLine({
      firstName: '  Priya  ',
      productSummary: 'Snowboard\n  and bindings',
      discountLabel: '10%   off',
      code: ' GAINABC123 ',
      checkoutUrl: checkout,
      bargainUrl: bargain,
    })

    expect(line).not.toMatch(/\s{2,}/)
    expect(line).not.toContain('\n')
    expect(line).toContain('Snowboard and bindings')
  })

  it('never truncates either URL when product names are huge', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: `${'Very long product name '.repeat(40)}Snowboard`,
      discountLabel: '10% off',
      code: 'GAINABC123',
      checkoutUrl: checkout,
      bargainUrl: bargain,
    })

    expect(line).toContain(checkout)
    expect(line).toContain(bargain)
    expect(line).toContain('…')
    expect(line.length).toBeLessThan(700)
  })

  it('still produces a non-empty line when every descriptive field is missing', () => {
    const line = buildRecoveryOfferLine({ checkoutUrl: checkout, bargainUrl: bargain })
    expect(line).toContain('your cart is still saved')
    expect(line).toContain(checkout)
    expect(line).toContain(bargain)
  })
})
