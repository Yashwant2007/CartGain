import { checkoutAcceptedMessage, dealAcceptedMessage, dealAcceptedReassurance } from '../post-deal'

describe('post-deal reassurance', () => {
  it('confirms the agreed price and code without pressure', () => {
    const message = dealAcceptedMessage({ price: '₹850', code: 'GAIN123' })
    expect(message).toContain('₹850')
    expect(message).toContain('GAIN123')
    expect(message).toMatch(/no need to rush/i)
  })

  it('does not overstate an unconfirmed code', () => {
    const message = dealAcceptedMessage({ price: '₹850', code: 'GAIN123', verified: false })
    expect(message).toMatch(/confirm/i)
  })

  it('gives checkout and quote confirmations one calm next step', () => {
    expect(checkoutAcceptedMessage({ code: 'GAIN123' })).toMatch(/no pressure/i)
    expect(dealAcceptedReassurance({ price: '₹850', code: 'GAIN123' })).toContain('secure checkout')
  })
})
