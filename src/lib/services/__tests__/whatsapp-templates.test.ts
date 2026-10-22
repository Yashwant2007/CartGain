import { WhatsAppTemplates } from '../../services/whatsapp'

const templates = [
  WhatsAppTemplates.abandoned_cart,
  WhatsAppTemplates.abandoned_cart_followup,
  WhatsAppTemplates.abandoned_cart_urgent,
]

describe('WhatsApp recovery templates', () => {
  it.each(templates.map((t) => [t.name, t] as const))(
    '%s fills every body variable and never sends an empty one',
    (_name, template) => {
      const params = template.generateParams('', '', '', undefined, undefined)
      expect(params.body).toHaveLength(3)
      for (const value of params.body ?? []) {
        expect(typeof value).toBe('string')
        expect((value as string).trim().length).toBeGreaterThan(0)
      }
    }
  )

  it.each(templates.map((t) => [t.name, t] as const))(
    '%s passes the offer line and links through unchanged',
    (_name, template) => {
      const offerLine =
        'Use code GAINABC123 for 10% off: https://cart-gain.com/r/cart_1?c=whatsapp&to=checkout&code=GAINABC123 — or name your price: https://cart-gain.com/r/cart_1?c=whatsapp&to=bargain'
      const params = template.generateParams('Priya', 'Your cart is saved.', offerLine, undefined)
      expect(params.body?.[1]).toBe('Your cart is saved.')
      expect(params.body?.[2]).toBe(offerLine)
    }
  )

  it('sends no button component by default (approved template keeps its own)', () => {
    const params = WhatsAppTemplates.abandoned_cart.generateParams('Priya', 'Body', 'Offer')
    expect(params.buttons).toBeUndefined()
  })

  it('sends only the url SUFFIX, never a full url, in the button parameter', () => {
    const params = WhatsAppTemplates.abandoned_cart.generateParams('Priya', 'Body', 'Offer', undefined, {
      buttonUrlSuffix: 'cart_1?c=wa',
    })
    expect(params.buttons).toEqual([
      { type: 'url', text: 'Complete Purchase', url: 'cart_1?c=wa' },
    ])
    expect(params.buttons?.[0].url).not.toContain('https://')
  })
})
