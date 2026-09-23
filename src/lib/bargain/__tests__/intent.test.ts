import { analyzeIntent, shopperIntentToPromptBlock, intentShortLabel } from '../intent'

describe('analyzeIntent', () => {
  it('classifies price-driven messages', () => {
    const a = analyzeIntent('what is the best price you can do')
    expect(a.intent).toBe('PRICE_ONLY')
    expect(a.objection).toBe('PRICE')
  })

  it('classifies budget constraints', () => {
    const a = analyzeIntent("i only have 500 rupees to spend")
    expect(a.intent).toBe('BUDGET_CONSTRAINT')
    expect(a.objection).toBe('PRICE')
  })

  it('classifies comparison to other stores', () => {
    const a = analyzeIntent('amazon is selling this cheaper')
    expect(a.intent).toBe('COMPARISON')
  })

  it('classifies product questions about materials/features', () => {
    const a = analyzeIntent('what material is it made of?')
    expect(a.intent).toBe('PRODUCT_QUESTION')
  })

  it('classifies variant mismatch', () => {
    const a = analyzeIntent('do you have this in size L? i need it in L')
    expect(a.intent).toBe('PRODUCT_MISMATCH')
    expect(a.objection).toBe('FIT_VARIANT')
  })

  it('classifies readiness to buy', () => {
    const a = analyzeIntent("ok deal done, i'll take it")
    expect(a.intent).toBe('PURCHASE_READY')
  })

  it('classifies walkout threats', () => {
    const a = analyzeIntent('im leaving, forget it')
    expect(a.intent).toBe('WALKOUT')
  })

  it('falls back to GENERIC_CHAT for chatter', () => {
    const a = analyzeIntent('haha nice')
    expect(a.intent).toBe('GENERIC_CHAT')
  })

  it('records price signal when money appears', () => {
    const a = analyzeIntent('₹600 is all I can do')
    expect(a.offersPriceSignal).toBe(true)
  })

  it('prioritizes purchase intent over generic price when both present', () => {
    const a = analyzeIntent("yes let's lock the deal, best price")
    expect(a.intent).toBe('PURCHASE_READY')
  })
})

describe('shopperIntentToPromptBlock', () => {
  it('mentions the objection when one was detected', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('i have a tight budget of 400'))
    expect(block).toContain('Objection detected')
    expect(block).toContain('price objection')
  })

  it('prompts honesty for product questions outside the verified context', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('does it have a warranty?'))
    expect(block).toContain('product-information question')
    expect(block).toContain('not in PRODUCT CONTEXT')
  })
})

describe('intentShortLabel', () => {
  it('joins intent and objection', () => {
    expect(intentShortLabel(analyzeIntent('only have 300 budget'))).toBe('BUDGET_CONSTRAINT:PRICE')
  })
})