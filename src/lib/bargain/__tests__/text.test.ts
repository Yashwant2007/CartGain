import {
  detectWalkout,
  extractQuantity,
  extractPrice,
} from '../text'

// ── detectWalkout ──

describe('detectWalkout', () => {
  it('returns true for direct walkout phrases', () => {
    expect(detectWalkout("I'm out")).toBe(true)
    expect(detectWalkout('i am leaving')).toBe(true)
    expect(detectWalkout('forget it')).toBe(true)
    expect(detectWalkout('never mind')).toBe(true)
    expect(detectWalkout("I'm walking away")).toBe(true)
    expect(detectWalkout('bye')).toBe(true)
    expect(detectWalkout('goodbye')).toBe(true)
    expect(detectWalkout('drop the deal')).toBe(true)
    expect(detectWalkout('forget this, dropping the deal')).toBe(true)
  })

  it('returns true for "not buying anymore"', () => {
    expect(detectWalkout("I'm not interested anymore")).toBe(true)
    expect(detectWalkout('not buying anymore')).toBe(true)
    expect(detectWalkout('skip the deal')).toBe(true)
  })

  it('detects price complaint + exit intent combined', () => {
    expect(detectWalkout('too expensive, I am leaving')).toBe(true)
    expect(detectWalkout("it's a rip off, going elsewhere")).toBe(true)
    expect(detectWalkout('overpriced, I will buy from another store')).toBe(true)
    expect(detectWalkout("can't afford this, walking away")).toBe(true)
  })

  it('detects "take my business elsewhere"', () => {
    expect(detectWalkout('I will take my business elsewhere')).toBe(true)
    expect(detectWalkout('I am taking my money somewhere else')).toBe(true)
    // "another" is now a recognized exit keyword — this should also fire
    expect(detectWalkout('bring my money to another shop')).toBe(true)
  })

  it('detects mentions of competitor platforms', () => {
    expect(detectWalkout('too expensive, I will go to Amazon')).toBe(true)
    expect(detectWalkout("can't afford, switching to Flipkart")).toBe(true)
    expect(detectWalkout('overpriced, Meesho has it cheaper — leaving')).toBe(true)
  })

  it('does NOT fire on leaving *for unrelated reasons* (going to work, school, etc.)', () => {
    expect(detectWalkout('leaving for work, brb')).toBe(false)
    expect(detectWalkout('going to the gym, back later')).toBe(false)
    expect(detectWalkout('have to step away for dinner')).toBe(false)
    expect(detectWalkout('going to school now')).toBe(false)
    expect(detectWalkout('heading out for lunch')).toBe(false)
  })

  it('returns false for plain price complaints without exit intent', () => {
    expect(detectWalkout('this is too expensive')).toBe(false)
    expect(detectWalkout('overpriced!')).toBe(false)
    expect(detectWalkout('rip off but I am negotiating')).toBe(false)
  })

  it('returns false for neutral bargaining phrases', () => {
    expect(detectWalkout('how about ₹400?')).toBe(false)
    expect(detectWalkout('can you go lower?')).toBe(false)
    expect(detectWalkout('deal! I accept')).toBe(false)
    expect(detectWalkout('I will think about it')).toBe(false)
  })

  it('resists casual emojis and punctuation', () => {
    expect(detectWalkout('okay bye!! 👋')).toBe(true)
    expect(detectWalkout('forget it...')).toBe(true)
  })
})

// ── extractQuantity ──

describe('extractQuantity', () => {
  it('detects explicit unit words', () => {
    expect(extractQuantity('I want 2 units')).toBe(2)
    expect(extractQuantity('give me 5 pieces')).toBe(5)
    expect(extractQuantity('3 pcs please')).toBe(3)
    expect(extractQuantity('I will take 4 items')).toBe(4)
    expect(extractQuantity('need 10 qty')).toBe(10)
    expect(extractQuantity('2 nos')).toBe(2)
    expect(extractQuantity('qty: 6')).toBe(6)
    expect(extractQuantity('quantity 8')).toBe(8)
  })

  it('detects "N of these/them"', () => {
    expect(extractQuantity('2 of these')).toBe(2)
    expect(extractQuantity('3 of them')).toBe(3)
    expect(extractQuantity('5 of those')).toBe(5)
  })

  it('detects verb + number patterns', () => {
    expect(extractQuantity('buy 3')).toBe(3)
    expect(extractQuantity('take 5')).toBe(5)
    expect(extractQuantity('I want 10')).toBe(10)
    expect(extractQuantity('I need 4 of these')).toBe(4)
    expect(extractQuantity('order 6 please')).toBe(6)
  })

  it('detects multiplier "Nx" / "N×"', () => {
    expect(extractQuantity('3x')).toBe(3)
    expect(extractQuantity('5 x')).toBe(5)
    expect(extractQuantity('I will take 4x of this')).toBe(4)
  })

  it('detects dozen / half dozen', () => {
    expect(extractQuantity('a dozen please')).toBe(12)
    expect(extractQuantity('half a dozen')).toBe(6)
    expect(extractQuantity('give me a dozen of these')).toBe(12)
  })

  it('rejects quantity < 2', () => {
    expect(extractQuantity('buy 1')).toBeNull()
    expect(extractQuantity('take 0')).toBeNull()
  })

  it('rejects absurdly large quantities (>100)', () => {
    expect(extractQuantity('500 units')).toBeNull()
  })

  it('returns null when no quantity context exists', () => {
    expect(extractQuantity('I want this product')).toBeNull()
    expect(extractQuantity('hello, can you do ₹400?')).toBeNull()
    expect(extractQuantity('')).toBeNull()
  })

  it('does NOT mistake a currency amount for a quantity', () => {
    // "₹500" should never be treated as 500 units
    expect(extractQuantity('I offer ₹500 for this')).toBeNull()
    expect(extractQuantity('my budget is $200')).toBeNull()
    expect(extractQuantity('take 5 rupees only')).toBeNull()
  })
})

// ── extractPrice ──

describe('extractPrice', () => {
  it('extracts INR prices in multiple formats', () => {
    expect(extractPrice('I offer ₹400')).toBe(400)
    expect(extractPrice('can you do Rs. 350?')).toBe(350)
    expect(extractPrice('I will pay INR 999 for this')).toBe(999)
    expect(extractPrice('450 rupees final')).toBe(450)
    expect(extractPrice('₹89.99')).toBeCloseTo(89.99)
  })

  it('extracts USD and EUR prices', () => {
    expect(extractPrice('I offer $25')).toBe(25)
    expect(extractPrice('about USD 30')).toBe(30)
    expect(extractPrice('€15 is my budget')).toBe(15)
    expect(extractPrice('20 dollars')).toBe(20)
  })

  it('extracts a bare number when no currency symbol exists', () => {
    expect(extractPrice('I offer 250')).toBe(250)
    expect(extractPrice('my final is 499')).toBe(499)
  })

  it('prefers the first valid match and ignores noise numbers', () => {
    expect(extractPrice('I have ₹500 budget, offer ₹400')).toBe(500)
  })

  it('returns null when no numeric offer is mentioned', () => {
    expect(extractPrice('can you go lower?')).toBeNull()
    expect(extractPrice('too expensive!')).toBeNull()
    expect(extractPrice('')).toBeNull()
  })

  it('rejects zero and absurdly large numbers', () => {
    // 0 is filtered out by the `val > 0` guard — returns null
    expect(extractPrice('I want it for ₹0')).toBeNull()
    // numbers >= 1,000,000 are filtered out — returns null
    expect(extractPrice('₹2000000')).toBeNull()
  })

  it('handles currency placed after the number', () => {
    expect(extractPrice('350 ₹ final')).toBe(350)
    expect(extractPrice('25 $ only')).toBe(25)
  })
})
