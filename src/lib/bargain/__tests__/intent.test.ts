import { analyzeIntent, extractBudget, extractNeed, shopperIntentToPromptBlock, intentShortLabel, objectionAction } from '../intent'

describe('analyzeIntent', () => {
  it('classifies price-driven messages', () => {
    const a = analyzeIntent('what is the best price you can do')
    expect(a.intent).toBe('PRICE_ONLY')
    expect(a.objection).toBe('PRICE')
    expect(a.asksBestPrice).toBe(true)
  })

  it('classifies "how low can you go" as a direct best-price ask', () => {
    const a = analyzeIntent('HII HOW ARE YOU HOW MUCH LOW CAN YOU GO')
    expect(a.intent).toBe('PRICE_ONLY')
    expect(a.objection).toBe('PRICE')
    expect(a.asksBestPrice).toBe(true)
    expect(a.offersPriceSignal).toBe(false)
  })

  it('classifies budget constraints', () => {
    const a = analyzeIntent("i only have 500 rupees to spend")
    expect(a.intent).toBe('BUDGET_CONSTRAINT')
    expect(a.objection).toBe('BUDGET')
    expect(a.category).toBe('BUDGET_OBJECTION')
  })

  it('classifies comparison to other stores', () => {
    const a = analyzeIntent('amazon is selling this cheaper')
    expect(a.intent).toBe('COMPARISON')
  })

  it('classifies "other brand was giving for 400" as comparison, not an offer', () => {
    const a = analyzeIntent('umm the other brand was giving for 400')
    expect(a.intent).toBe('COMPARISON')
    expect(a.objection).toBe('COMPARISON')
    expect(a.offersPriceSignal).toBe(false)
    expect(a.nonOfferNumberContext).toBe('comparison')
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

  it('classifies Hinglish "do laga do" as readiness to buy', () => {
    const a = analyzeIntent('chlo do laga do 1300 m?')
    expect(a.intent).toBe('PURCHASE_READY')
    expect(a.offersPriceSignal).toBe(true)
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

  it('flags a price complaint so a named price is not read as an offer', () => {
    const a = analyzeIntent('714 is a little too much for this')
    expect(a.priceComplaint).toBe(true)
    expect(a.offersPriceSignal).toBe(false)
    expect(a.objection).toBe('PRICE')
    expect(a.intent).toBe('PRICE_ONLY')
  })

  it('still records a real bid that follows a complaint', () => {
    const a = analyzeIntent("500 is too much, I'll give 450")
    expect(a.priceComplaint).toBe(true)
    expect(a.offersPriceSignal).toBe(true)
  })

  it('does not flag a genuine budget or a bid as a complaint', () => {
    expect(analyzeIntent('my budget is 500').priceComplaint).toBe(false)
    expect(analyzeIntent("i'll pay 450").priceComplaint).toBe(false)
  })

  it('records a non-offer number context for ambiguous numbers', () => {
    expect(analyzeIntent('I need 2 items').nonOfferNumberContext).toBe('quantity')
    expect(analyzeIntent('my order #1234').nonOfferNumberContext).toBe('identifier')
    expect(analyzeIntent('my budget is 700').nonOfferNumberContext).toBe('budget')
    expect(analyzeIntent('call me at 5').nonOfferNumberContext).toBe('contact')
    expect(analyzeIntent('broo this is too much i have to buy gta 6 i am saving money pls understand').nonOfferNumberContext).toBe('casual')
  })

  it('reads a casual saving-story message as a price complaint without inventing an offer', () => {
    const a = analyzeIntent('broo this is too much i have to buy gta 6 i am saving money pls understand')
    expect(a.priceComplaint).toBe(true)
    expect(a.offersPriceSignal).toBe(false)
    expect(a.nonOfferNumberContext).toBe('casual')
  })

  it('does not treat arbitrary numbers as offers', () => {
    expect(analyzeIntent('I need 2 items').offersPriceSignal).toBe(false)
    expect(analyzeIntent('product 12345').offersPriceSignal).toBe(false)
    expect(analyzeIntent('model 2024').offersPriceSignal).toBe(false)
    expect(analyzeIntent('my order #1234').offersPriceSignal).toBe(false)
    expect(analyzeIntent('call me at 5').offersPriceSignal).toBe(false)
    expect(analyzeIntent('I got 10% off last time').offersPriceSignal).toBe(false)
    expect(analyzeIntent('my budget is 700').offersPriceSignal).toBe(false)
    expect(analyzeIntent('I have 700 in my other cart').offersPriceSignal).toBe(false)
    expect(analyzeIntent('I offer 700').offersPriceSignal).toBe(true)
  })
})

describe('shopperIntentToPromptBlock', () => {
  it('mentions the objection when one was detected', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('i have a tight budget of 400'))
    expect(block).toContain('Objection detected')
    expect(block).toContain('budget objection')
  })

  it('prompts honesty for product questions outside the verified context', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('does it have a warranty?'))
    expect(block).toContain('product-information question')
    expect(block).toContain('not in PRODUCT CONTEXT')
  })

  it('tells the model to answer a best-price ask directly', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('how low can you go'))
    expect(block).toContain('HOW LOW YOU CAN GO')
    expect(block).toContain('Answer directly')
    expect(block).toContain('do NOT ask them to name a price')
  })

  it('tells the model a price complaint is not an offer', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('900 is too expensive'))
    expect(block).toContain('COMPLAINING about the price')
  })

  it('tells the model that ambiguous numbers are context, not bids', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('I need 2 items'))
    expect(block).toContain('NOT an offer')
    expect(block).toContain('Do not quote this number back as their offer')
  })

  it('adds honest casual-topic guidance without claiming a trend', () => {
    const block = shopperIntentToPromptBlock(analyzeIntent('broo this is too much i have to buy gta 6 i am saving money pls understand'))
    expect(block).toContain('CASUAL/TOPIC REFERENCE')
    expect(block).toContain('Do not claim what is trending')
  })
})

describe('intentShortLabel', () => {
  it('joins intent and objection', () => {
    expect(intentShortLabel(analyzeIntent('only have 300 budget'))).toBe('BUDGET_CONSTRAINT:BUDGET')
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

describe('analyzeIntent — Phase 1 objection taxonomy', () => {
  it('detects a quality concern', () => {
    const a = analyzeIntent('is the build quality good? will it last long?')
    expect(a.objection).toBe('QUALITY')
    expect(a.category).toBe('QUALITY_OBJECTION')
  })

  it('detects purchase hesitation without treating it as a rejection', () => {
    const a = analyzeIntent('let me think about it, not sure yet')
    expect(a.intent).toBe('PURCHASE_HESITATION')
    expect(a.objection).toBe('PURCHASE_HESITATION')
    expect(a.category).toBe('PURCHASE_HESITATION')
  })

  it('detects an availability concern', () => {
    const a = analyzeIntent('is it in stock or sold out?')
    expect(a.objection).toBe('AVAILABILITY')
    expect(a.category).toBe('PRODUCT_INFORMATION')
  })

  it('classifies a shipping objection', () => {
    const a = analyzeIntent('the shipping cost is a lot for me')
    expect(a.objection).toBe('SHIPPING')
    expect(a.category).toBe('SHIPPING_OBJECTION')
  })

  it('classifies comparison', () => {
    const a = analyzeIntent('amazon has it for less')
    expect(a.category).toBe('COMPARISON_OBJECTION')
  })

  it('classifies a plain price objection', () => {
    const a = analyzeIntent('this is too expensive')
    expect(a.category).toBe('PRICE_OBJECTION')
  })

  it('maps an unknown message to OTHER_OR_UNKNOWN', () => {
    expect(analyzeIntent('hi there').category).toBe('OTHER_OR_UNKNOWN')
  })

  it('exposes the intent→action mapping', () => {
    expect(objectionAction('PRICE_OBJECTION')).toBe('smart bargaining')
    expect(objectionAction('QUALITY_OBJECTION')).toBe('explain verified product benefits')
    expect(objectionAction('PURCHASE_HESITATION')).toMatch(/friction/i)
  })
})