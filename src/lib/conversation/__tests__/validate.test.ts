import { ConversationFacts } from '../facts'
import { DEFAULT_VOICE, resolveVoice } from '../voice'
import { isNearDuplicate, validateMessage } from '../validate'

const facts: ConversationFacts = {
  storeName: 'Acme',
  currencySymbol: '₹',
  items: [
    { name: 'Vitamin C Serum', price: 1200, quantity: 1 },
    { name: 'Retinol Moisturizer', price: 800, quantity: 2 },
  ],
  total: 2800,
  cartUrl: 'https://cart-gain.com/r/cart_1?c=email',
  customerName: 'Asha',
  channel: 'email',
}

const ok = 'Hi Asha, your Vitamin C Serum is still saved — total ₹1,200. Come back whenever you are ready.'

function codes(text: string): string[] {
  return validateMessage(text, facts, DEFAULT_VOICE).issues.map((i) => i.code)
}

describe('validateMessage — factual claims', () => {
  it('accepts a plain facts-only message', () => {
    const result = validateMessage(ok, facts, DEFAULT_VOICE)
    expect(result.ok).toBe(true)
    expect(result.issues.filter((i) => i.severity === 'block')).toHaveLength(0)
  })

  it.each([
    'Our serum is selling out fast.',
    'Only 2 left in stock!',
    'Almost sold out — grab yours.',
    'This is our bestseller this month.',
    "Everyone who's tried it is obsessed.",
    'The reviews are insane.',
    'This is your last chance.',
    'Your cart expires today.',
    'Your cart expires tonight, final reminder.',
    'We guarantee you will love it.',
    'Money-back guarantee if you do not like it.',
    'It is cheaper elsewhere? We price match.',
    'Thousands of customers love this routine.',
  ])('blocks the fabricated claim: %s', (text) => {
    const result = validateMessage(text, facts, DEFAULT_VOICE)
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'unverified_claim', severity: 'block' })
    )
  })

  it.each([
    'I personally checked your cart.',
    'I just verified your order.',
    'My manager saved this for you.',
    'I am a real human, not a bot.',
  ])('blocks human impersonation: %s', (text) => {
    expect(validateMessage(text, facts, DEFAULT_VOICE).ok).toBe(false)
  })

  it('allows a bestseller claim when the merchant has verified sales data', () => {
    const withData: ConversationFacts = { ...facts, verified: { bestseller: true } }
    const result = validateMessage('Our bestseller, saved for you.', withData, DEFAULT_VOICE)
    expect(result.ok).toBe(true)
  })

  it('allows a low-stock claim only with verified inventory data', () => {
    const withData: ConversationFacts = { ...facts, verified: { lowStock: true } }
    expect(validateMessage('We are almost sold out.', withData, DEFAULT_VOICE).ok).toBe(true)
  })

  it('allows social proof only with a real review count', () => {
    const withData: ConversationFacts = { ...facts, verified: { reviewCount: 214 } }
    expect(validateMessage("Everyone who's tried it is obsessed.", withData, DEFAULT_VOICE).ok).toBe(true)
  })

  it('does not treat zero reviews as verified social proof', () => {
    const withData: ConversationFacts = { ...facts, verified: { reviewCount: 0 } }
    expect(validateMessage("Everyone who's tried it is obsessed.", withData, DEFAULT_VOICE).ok).toBe(false)
  })
})

describe('validateMessage — money, codes and links', () => {
  it('allows prices that appear in the facts', () => {
    expect(validateMessage('Your total is ₹2,800.', facts, DEFAULT_VOICE).ok).toBe(true)
    expect(validateMessage('The serum is ₹1,200.', facts, DEFAULT_VOICE).ok).toBe(true)
  })

  it('blocks a price that is not a known fact', () => {
    const result = validateMessage('Yours for just ₹499 today!', facts, DEFAULT_VOICE)
    expect(result.ok).toBe(false)
    expect(codes('Yours for just ₹499 today!')).toContain('unknown_price')
  })

  it('blocks an unauthorised discount code', () => {
    const result = validateMessage('Use code SAVE50 for a surprise.', facts, DEFAULT_VOICE)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain('unauthorized_discount')
  })

  it('allows the authorised code', () => {
    const withDiscount: ConversationFacts = {
      ...facts,
      discount: { code: 'SAVE10', value: 10, type: 'percentage' },
    }
    expect(validateMessage('Use code SAVE10 at checkout.', withDiscount, DEFAULT_VOICE).ok).toBe(true)
  })

  it('blocks a percentage off that was not authorised', () => {
    expect(codes('Enjoy 50% off today.')).toContain('unauthorized_discount')
  })

  it('allows the authorised percentage', () => {
    const withDiscount: ConversationFacts = {
      ...facts,
      discount: { code: 'SAVE10', value: 10, type: 'percentage' },
    }
    expect(validateMessage('Use code SAVE10 for 10% off.', withDiscount, DEFAULT_VOICE).ok).toBe(true)
  })

  it('blocks links to other hosts', () => {
    const result = validateMessage('Buy here: https://evil.example/steal', facts, DEFAULT_VOICE)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain('unapproved_link')
  })

  it('allows the cart link host', () => {
    expect(
      validateMessage('Pick up here: https://cart-gain.com/r/cart_1?c=email', facts, DEFAULT_VOICE).ok
    ).toBe(true)
  })
})

describe('validateMessage — voice rules', () => {
  it('strips emoji when the voice forbids them', () => {
    const result = validateMessage('Your cart is saved 🛍️ ✨', facts, resolveVoice({ emojiIntensity: 'off' }))
    expect(result.text).toBe('Your cart is saved')
    expect(result.ok).toBe(true)
  })

  it('blocks too many emoji for the channel', () => {
    const result = validateMessage('Saved ✨ 🛍️ 🚚 💫', facts, resolveVoice({ emojiIntensity: 'subtle' }))
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain('too_many_emoji')
  })

  it('blocks merchant-banned phrases', () => {
    const voice = resolveVoice({ bannedPhrases: ['deal of the day'] })
    const result = validateMessage('This is our deal of the day.', facts, voice)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain('banned_phrase')
  })

  it('blocks markup in WhatsApp copy', () => {
    const wa: ConversationFacts = { ...facts, channel: 'whatsapp' }
    const result = validateMessage('<b>Saved</b> your cart', wa, DEFAULT_VOICE)
    expect(result.ok).toBe(false)
    expect(result.issues.map((i) => i.code)).toContain('formatting')
  })

  it('blocks an empty message', () => {
    const result = validateMessage('   ', facts, DEFAULT_VOICE)
    expect(result.ok).toBe(false)
    expect(result.issues[0].code).toBe('empty')
  })

  it('warns (but does not block) on near-duplicate copy', () => {
    const result = validateMessage(ok, facts, DEFAULT_VOICE, { previous: ok })
    expect(result.ok).toBe(true)
    expect(result.issues.map((i) => i.code)).toContain('duplicate')
  })
})

describe('regression: the old hardcoded fallbacks are now blocked', () => {
  // These exact sentences shipped in fallbackBodyContent / the email template.
  const legacy = [
    'Vitamin C Serum is our #1 bestseller this month 💫 People are loving it — and we saved your picks before they sell out.',
    "Asha, your Vitamin C Serum won't wait forever ⏳ Stock is moving fast and this deal ends soon. Last chance to grab what's yours.",
    'Items in your cart are in high demand and may sell out soon!',
    "Don't wait too long — the best finds always go fast.",
  ]

  it.each(legacy)('would have been blocked: %s', (text) => {
    expect(validateMessage(text, facts, DEFAULT_VOICE).ok).toBe(false)
  })

  it('still allows neutral flattery (not a factual claim)', () => {
    const text = "Asha, you've got incredible taste ✨ Vitamin C Serum looks absolutely stunning — we saved it all for you. Just one tap and it's yours 🚚"
    expect(validateMessage(text, facts, DEFAULT_VOICE).ok).toBe(true)
  })
})

describe('isNearDuplicate', () => {
  it('detects the same message with punctuation changes', () => {
    expect(isNearDuplicate(ok, ok.replace(/[.]/g, '!'))).toBe(true)
  })

  it('does not flag genuinely different copy', () => {
    expect(isNearDuplicate(ok, 'Your serum is waiting, Asha. Pick up where you left off.')).toBe(false)
  })
})
