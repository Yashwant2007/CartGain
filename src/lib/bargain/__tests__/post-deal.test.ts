import { checkoutAcceptedMessage, dealAcceptedMessage, dealAcceptedReassurance } from '../post-deal'

describe('post-deal reassurance', () => {
  it('keeps the same final price in the accepted deal message', () => {
    const message = dealAcceptedMessage({ price: '₹850', code: 'GAIN123', persona: 'friendly_shopkeeper' })
    expect(message).toContain('₹850')
    expect(message).toContain('GAIN123')
    expect(message.toLowerCase()).toContain('no need to rush')
  })

  it('avoids implying the deal is final before verification', () => {
    const message = dealAcceptedMessage({ price: '₹850', code: 'GAIN123', verified: false, persona: 'friendly_shopkeeper' })
    expect(message.toLowerCase()).toContain('confirm')
  })

  it('keeps reassurance explicit and persona-aware', () => {
    expect(checkoutAcceptedMessage({ code: 'GAIN123', persona: 'friendly_shopkeeper' })).toMatch(/no pressure/i)
    expect(dealAcceptedReassurance({ price: '₹850', code: 'GAIN123', persona: 'strict_negotiator' })).toContain('secure checkout')
    expect(dealAcceptedMessage({ price: '₹850', code: 'GAIN123', persona: 'playful_friend' })).toContain('🎉')
  })
})
