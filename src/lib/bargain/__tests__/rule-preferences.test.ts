import { applyRulePreferences } from '@/lib/bargain/rule-preferences'
import type { NegotiationContext, NegotiationResult } from '@/lib/bargain/engine'
import type { PaymentAwarenessConfig } from '@/lib/bargain/payment'
import type { ShippingConfig } from '@/lib/bargain/shipping'

const ctx: NegotiationContext = {
  storeName: 'Test Store',
  currencySymbol: '₹',
  originalPrice: 1000,
  minPrice: 700,
  attemptsUsed: 1,
  maxAttempts: 3,
  persona: 'friendly_shopkeeper',
  productTitle: 'Test Product',
  bulkQuantity: 1,
}

const counter: NegotiationResult = {
  reply: 'I can do ₹900 for you.',
  decision: 'counter',
  counterOffer: 900,
  tactic: 'test',
  metadata: { source: 'test' },
}

const shipping: ShippingConfig = { enabled: true, flatCost: 40, freeThreshold: 1000 }
const payment: PaymentAwarenessConfig = {
  enabled: true,
  prepaidIncentivePercent: 5,
  codRtoEnabled: true,
  rtoIncentive: 30,
}

describe('applyRulePreferences', () => {
  it('leaves non-counter decisions untouched', () => {
    const result: NegotiationResult = { reply: 'Thanks for reaching out.', decision: 'chat' }
    expect(applyRulePreferences(result, { ...ctx, negotiationMode: 'flexible' })).toBe(result)
  })

  it('keeps the authoritative counter and adds truthful mode/style/shipping/payment guidance', () => {
    const result = applyRulePreferences(counter, {
      ...ctx,
      negotiationMode: 'conservative',
      negotiationStyle: 'budget_advisor',
      shipping,
      payment: { intent: 'cod', config: payment },
    })

    expect(result.counterOffer).toBe(900)
    expect(result.metadata).toEqual({ source: 'test' })
    expect(result.reply).toContain('I can do ₹900 for you.')
    expect(result.reply).toContain('I\'ll keep this close to the listed price while you decide.')
    expect(result.reply).toContain('I\'ll keep your budget in view.')
    expect(result.reply).toContain('Add ₹100 more (1 more at this price) to unlock free shipping.')
    expect(result.reply).toContain('Switching to prepaid can unlock a prepaid saving of ₹30 and up to 5% extra for prepaid.')
    expect(result.reply).not.toContain('700')
  })

  it('adds nothing for balanced mode and prepaid intent with no enabled levers', () => {
    const result = applyRulePreferences(counter, {
      ...ctx,
      negotiationMode: 'balanced',
      payment: { intent: 'prepaid', config: { ...payment, prepaidIncentivePercent: 0, codRtoEnabled: false, rtoIncentive: 0 } },
    })
    expect(result).toEqual(counter)
  })
})
