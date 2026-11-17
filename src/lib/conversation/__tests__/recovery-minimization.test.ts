import { buildRecoveryFacts } from '../recovery'
import { buildRecoveryPrompt } from '../prompts'
import { DEFAULT_VOICE } from '../voice'

describe('recovery AI data minimization', () => {
  it('does not pass email, phone, address or cart tokens into the prompt', () => {
    const facts = buildRecoveryFacts({
      storeId: 'store_1',
      storeName: 'Example Store',
      currencySymbol: '₹',
      customerName: 'Priya',
      items: [{ name: 'Linen shirt', price: 2200, quantity: 1 }],
      total: 2200,
      cartUrl: 'https://cart-gain.com/cart/internal-id',
      channel: 'email',
      step: 0,
      voice: DEFAULT_VOICE,
      // Fields that must never reach the model.
      customerEmail: 'priya@example.com',
      customerPhone: '+919876543210',
      shippingAddress: '12 Secret Lane',
      cartToken: 'checkout-secret-token',
    } as any)

    expect(facts).not.toHaveProperty('customerEmail')
    expect(facts).not.toHaveProperty('customerPhone')
    expect(facts).not.toHaveProperty('shippingAddress')
    expect(facts).not.toHaveProperty('cartToken')

    const prompt = buildRecoveryPrompt({
      facts,
      voice: DEFAULT_VOICE,
      stage: 'reminder_1',
    })
    const combined = `${prompt.system}\n${prompt.user}`
    expect(combined).not.toContain('priya@example.com')
    expect(combined).not.toContain('+919876543210')
    expect(combined).not.toContain('12 Secret Lane')
    expect(combined).not.toContain('checkout-secret-token')
    expect(combined).toContain('Priya')
  })
})
