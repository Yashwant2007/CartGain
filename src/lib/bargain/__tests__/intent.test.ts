import { analyzeIntent, extractBudget, extractNeed, shopperIntentToPromptBlock, intentShortLabel } from '../intent'

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

describe('analyzeIntent — recommendations', () => {
  it('classifies an explicit alternatives request', () => {
    const a = analyzeIntent('show me other options from this store')
    expect(a.intent).toBe('RECOMMENDATION_REQUEST')
  })

  it('classifies product discovery', () => {
    const a = analyzeIntent('i am looking for something for my oily skin')
    expect(a.intent).toBe('PRODUCT_DISCOVERY')
    expect(a.need).toBeTruthy()
  })

  it('extracts a structured budget from a budget message', () => {
    const a = analyzeIntent('my budget is 500')
    expect(a.intent).toBe('BUDGET_CONSTRAINT')
    expect(a.budget).toBe(500)
    expect(a.budgetType).toBe('maximum')
  })

  it('extracts a budget given with symbol/prefix forms', () => {
    expect(extractBudget('i have ₹400 only')).toEqual({ amount: 400, type: 'maximum' })
    expect(extractBudget('under 1500')).toEqual({ amount: 1500, type: 'maximum' })
    expect(extractBudget('around 800 max')).toEqual({ amount: 800, type: 'maximum' })
  })

  it('frames a budget mention preceding its number as a cap', () => {
    const a = analyzeIntent('tight budget, maybe 350')
    expect(a.budget).toBe(350)
    expect(a.budgetType).toBe('maximum')
  })
})

describe('extractBudget', () => {
  it('returns null with no amount', () => {
    expect(extractBudget('can it be cheaper?')).toBeNull()
  })

  it('parses thousands separators', () => {
    expect(extractBudget('max 1,200')).toEqual({ amount: 1200, type: 'maximum' })
  })
})

describe('extractNeed', () => {
  it('captures a short topic and prunes stopwords', () => {
    expect(extractNeed('looking for something for acne prone skin')).toBe('acne prone skin')
  })

  it('returns null when nothing need-shaped appears', () => {
    expect(extractNeed('what is your best price')).toBeNull()
  })
})