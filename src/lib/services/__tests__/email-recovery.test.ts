import { EmailTemplates } from '../../services/email'

const items = [{ name: 'Sneaker', price: 100, quantity: 1, image: 'https://cdn.example/s.png' }]

function render(opts?: Parameters<typeof EmailTemplates.abandoned>[8]) {
  return EmailTemplates.abandoned(
    'Priya',
    items,
    100,
    'https://cart-gain.com/r/cart_1?c=email',
    'Acme',
    '₹',
    'Your cart is still saved.',
    'https://cart-gain.com/opt-out?x=1',
    opts,
  )
}

describe('EmailTemplates.abandoned — recovery email', () => {
  it('shows the product photo captured (or resolved) for each item', () => {
    const html = render()
    expect(html).toContain('src="https://cdn.example/s.png"')
    expect(html).toContain('alt="Sneaker"')

    const noImage = EmailTemplates.abandoned('Priya', [{ name: 'Sneaker', price: 100, quantity: 1 }], 100, 'https://x', 'Acme')
    expect(noImage).not.toContain('<img src="undefined"')
  })

  it('renders only truthful, neutral copy by default', () => {
    const html = render()
    expect(html).toContain('Your cart is still saved')
    for (const banned of ['last chance', 'selling out', 'bestseller', 'high demand', 'everyone']) {
      expect(html.toLowerCase()).not.toContain(banned)
    }
  })

  it('shows the offer code when a real offer exists', () => {
    const html = render({ offer: { code: 'GAINABC123', value: 10, type: 'percentage' } })
    expect(html).toContain('GAINABC123')
    expect(html).toContain('10% off this cart')
  })

  it('does not invent an offer when none was authorised', () => {
    const html = render({ offer: null })
    expect(html).not.toContain('Your personal offer')
  })

  it('sends the primary CTA to the checkout link with the code', () => {
    const html = render({
      offer: { code: 'GAINABC123', value: 10, type: 'percentage' },
      checkoutUrl: 'https://cart-gain.com/r/cart_1?c=email&to=checkout&code=GAINABC123',
    })
    expect(html).toContain('https://cart-gain.com/r/cart_1?c=email&amp;to=checkout&amp;code=GAINABC123')
  })

  it('adds the "name your price" CTA when a bargain link is supplied', () => {
    const html = render({
      bargainUrl: 'https://cart-gain.com/r/cart_1?c=email&to=bargain',
    })
    expect(html).toContain('name your price')
    expect(html).toContain('https://cart-gain.com/r/cart_1?c=email&amp;to=bargain')
  })

  it('omits the bargain CTA when no link is supplied', () => {
    expect(render()).not.toContain('name your price')
  })
})
