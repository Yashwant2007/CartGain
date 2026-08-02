import { detectWalkout, extractQuantity, extractPrice } from '@/lib/bargain/text'

describe('detectWalkout', () => {
  it('detects explicit walkout language', () => {
    expect(detectWalkout('I\'m out')).toBe(true)
    expect(detectWalkout('I am done')).toBe(true)
    expect(detectWalkout('i\'m leaving now')).toBe(true)
    expect(detectWalkout('I\'m heading out')).toBe(true)
    expect(detectWalkout('forget it')).toBe(true)
    expect(detectWalkout('never mind')).toBe(true)
    expect(detectWalkout('I changed my mind')).toBe(true)
    expect(detectWalkout('I\'m walking away')).toBe(true)
    expect(detectWalkout('going elsewhere')).toBe(true)
    expect(detectWalkout('I\'m heading somewhere else')).toBe(true)
    expect(detectWalkout('I can get it from another store')).toBe(true)
    expect(detectWalkout('I\'m not interested anymore')).toBe(true)
    expect(detectWalkout('skip the deal')).toBe(true)
    expect(detectWalkout('bye')).toBe(true)
    expect(detectWalkout('goodbye')).toBe(true)
    expect(detectWalkout('give up')).toBe(true)
  })

  it('detects price complaint combined with exit intent', () => {
    expect(detectWalkout('this is too expensive, I\'m leaving')).toBe(true)
    expect(detectWalkout('it\'s too expensive, I\'ll go to amazon')).toBe(true)
    expect(detectWalkout('what a rip off, I can get it elsewhere')).toBe(true)
    expect(detectWalkout('too expensive, leaving')).toBe(true)
  })

  it('detects "take my business elsewhere"', () => {
    expect(detectWalkout('I\'ll take my business elsewhere')).toBe(true)
    expect(detectWalkout('I will take my money somewhere else')).toBe(true)
    expect(detectWalkout('bring my business to another store')).toBe(true)
  })

  it('does NOT flag benign messages', () => {
    expect(detectWalkout('I\'m leaving for work now, can we finish later?')).toBe(false)
    expect(detectWalkout('I\'m going to school tomorrow')).toBe(false)
    expect(detectWalkout('I\'m out for dinner, will reply later')).toBe(false)
    expect(detectWalkout('just stepping away for a break')).toBe(false)
    expect(detectWalkout('this is too expensive')).toBe(false)
    expect(detectWalkout('can you do better?')).toBe(false)
    expect(detectWalkout('what is the best price?')).toBe(false)
    expect(detectWalkout('hello, is this available?')).toBe(false)
    expect(detectWalkout('okay let me think about it')).toBe(false)
  })
})

describe('extractQuantity', () => {
  it('extracts explicit unit counts', () => {
    expect(extractQuantity('I want 2 units')).toBe(2)
    expect(extractQuantity('give me 5 pieces')).toBe(5)
    expect(extractQuantity('need 3 pcs')).toBe(3)
    expect(extractQuantity('10 items please')).toBe(10)
    expect(extractQuantity('qty: 4')).toBe(4)
    expect(extractQuantity('quantity 6')).toBe(6)
  })

  it('extracts "N of these/them"', () => {
    expect(extractQuantity('I\'ll take 3 of these')).toBe(3)
    expect(extractQuantity('want 5 of them')).toBe(5)
  })

  it('extracts bare buy/take/want verbs', () => {
    expect(extractQuantity('I want 3')).toBe(3)
    expect(extractQuantity('buy 10 please')).toBe(10)
    expect(extractQuantity('I need 2')).toBe(2)
    expect(extractQuantity('take about 4')).toBe(4)
  })

  it('extracts dozen and multipliers', () => {
    expect(extractQuantity('half dozen')).toBe(6)
    expect(extractQuantity('a dozen')).toBe(12)
    expect(extractQuantity('3x')).toBe(3)
    expect(extractQuantity('5 x')).toBe(5)
  })

  it('rejects numbers that are prices, not quantities', () => {
    expect(extractQuantity('I\'ll take 2 at 500 rupees')).toBeNull()
    expect(extractQuantity('can you do 450?')).toBeNull()
    expect(extractQuantity('too expensive, i\'m leaving')).toBeNull()
    expect(extractQuantity('2')).toBeNull()
    expect(extractQuantity('buy 200')).toBeNull()
    expect(extractQuantity('hello')).toBeNull()
  })
})

describe('extractPrice', () => {
  it('extracts currency-prefixed prices', () => {
    expect(extractPrice('I can do ₹500')).toBe(500)
    expect(extractPrice('what about ₹450.50')).toBe(450.5)
    expect(extractPrice('$45 sounds fair')).toBe(45)
    expect(extractPrice('INR 800')).toBe(800)
  })

  it('extracts currency-suffixed prices', () => {
    expect(extractPrice('500 rupees ok?')).toBe(500)
    expect(extractPrice('I pay 45 dollars')).toBe(45)
    expect(extractPrice('Rs. 700')).toBe(700)
  })

  it('extracts bare numbers', () => {
    expect(extractPrice('I can pay 800')).toBe(800)
    expect(extractPrice('how about 650?')).toBe(650)
  })

  it('rejects invalid values', () => {
    expect(extractPrice('1000000')).toBeNull()
    expect(extractPrice('0')).toBeNull()
    expect(extractPrice('free')).toBeNull()
    expect(extractPrice('please give me a discount')).toBeNull()
  })
})
