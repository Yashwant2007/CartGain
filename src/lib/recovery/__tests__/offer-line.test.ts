import { buildRecoveryOfferLine } from '../offer-line'

const checkout = 'https://cart-gain.com/r/lCheck123'

describe('buildRecoveryOfferLine', () => {
  it('weaves the customer name + personal discount into the offer line', () => {
    const line = buildRecoveryOfferLine({
      firstName: 'Priya',
      productSummary: 'Snowboard',
      discountLabel: '10% off',
      code: 'GAINABC123',
      currencySymbol: '₹',
      checkoutUrl: checkout,
      bargainUrl: 'https://cart-gain.com/r/lOldBargain',
    })

    expect(line).toContain('Priya')
    expect(line).toContain('Priya, Your Snowboard is still saved.')
    expect(line).toContain("I've set aside 10% off for you.")
    expect(line).toContain('code GAINABC123')
    expect(line).toContain(checkout)
    expect(line).toContain('lOldBargain')
    expect(line).toContain('💬 Bargain now:')
    expect(line).toContain('🛒 Complete checkout:')
  })

  it('keeps a live checkout link when there is no discount', () => {
    const line = buildRecoveryOfferLine({
      productSummary: 'Snowboard',
      checkoutUrl: checkout,
    })

    expect(line).toContain('is still saved.')
    expect(line).toContain(checkout)
    expect(line).not.toContain(' — code ')
  })

  it('collapses whitespace in product text but keeps the CTA on its own line', () => {
    const line = buildRecoveryOfferLine({
      productSummary: 'Snowboard\n  and bindings',
      discountLabel: '10%   off',
      code: ' GAINABC123 ',
      checkoutUrl: checkout,
    })

    expect(line).not.toMatch(/[^\n]\s{2,}/)
    expect(line).toContain('\n🛒 Complete checkout:')
    expect(line).toContain('Snowboard and bindings')
  })

  it('never truncates the URL when product names are huge', () => {
    const line = buildRecoveryOfferLine({
      productSummary: `${'Very long product name '.repeat(40)}Snowboard`,
      discountLabel: '10% off',
      code: 'GAINABC123',
      checkoutUrl: checkout,
    })

    expect(line).toContain(checkout)
    expect(line).toContain('…')
    expect(line.length).toBeLessThan(300)
  })

  it('still produces a non-empty line when every descriptive field is missing', () => {
    const line = buildRecoveryOfferLine({ checkoutUrl: checkout })
    expect(line).toContain('Your cart is still saved.')
    expect(line).toContain(checkout)
  })

  it('includes currency, price and qty when provided', () => {
    const line = buildRecoveryOfferLine({
      productSummary: 'Snowboard',
      productPrice: 299,
      productQty: 2,
      currencySymbol: '₹',
      checkoutUrl: checkout,
    })

    expect(line).toContain('₹299.00')
    expect(line).toContain('× 2')
  })

  it('uses fallback "cart" when product summary is empty', () => {
    const line = buildRecoveryOfferLine({
      productSummary: '',
      checkoutUrl: checkout,
    })

    expect(line).toContain('Your cart is still saved.')
  })
})
