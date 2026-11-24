import { formatOfferMoney, isOverListOffer, overListOfferReply } from '../over-list-offer'

describe('isOverListOffer', () => {
  it('detects a meaningful offer above the listed price', () => {
    expect(isOverListOffer(1300, 729.95)).toBe(true)
    expect(isOverListOffer(900, 600)).toBe(true)
  })

  it('does not treat list price or near-list rounding as over-list', () => {
    expect(isOverListOffer(729.95, 729.95)).toBe(false)
    expect(isOverListOffer(730, 729.95)).toBe(false)
    expect(isOverListOffer(600, 600)).toBe(false)
  })

  it('ignores missing or invalid numbers', () => {
    expect(isOverListOffer(null, 729.95)).toBe(false)
    expect(isOverListOffer(1300, undefined)).toBe(false)
    expect(isOverListOffer(Number.NaN, 729.95)).toBe(false)
  })
})

describe('overListOfferReply', () => {
  it('thanks a generous Hinglish buyer without pretending the higher bid was accepted', () => {
    const reply = overListOfferReply({
      rawOffer: 1300,
      originalPrice: 729.95,
      currencySymbol: '₹',
      persona: 'friendly_shopkeeper',
      language: 'hinglish',
      customerMessage: 'chlo do laga do 1300 m?',
    })

    expect(reply).toMatch(/Shukriya/i)
    expect(reply).toContain('₹729.95')
    expect(reply).toContain('₹1,300.00')
    expect(reply).toMatch(/listed price se upar charge nahi/i)
    expect(reply.toLowerCase()).not.toMatch(/1300.*acceptable|acceptable.*1300/)
  })

  it('uses an honest close for a strict English shopkeeper', () => {
    const reply = overListOfferReply({
      rawOffer: 900,
      originalPrice: 600,
      currencySymbol: '$',
      persona: 'strict_negotiator',
      language: 'en',
    })

    expect(reply).toContain('$900.00')
    expect(reply).toContain('$600.00')
    expect(reply).toMatch(/won't charge above the list price/i)
  })

  it('does not invent scarcity or competitor matching', () => {
    const reply = overListOfferReply({
      rawOffer: 900,
      originalPrice: 600,
      currencySymbol: '$',
      persona: 'playful_friend',
      language: 'en',
    })

    expect(reply.toLowerCase()).not.toMatch(/last chance|selling fast|only \d+ left|cheaper elsewhere/)
  })
})

describe('formatOfferMoney', () => {
  it('groups large amounts and keeps two decimals', () => {
    expect(formatOfferMoney(1300, '₹')).toBe('₹1,300.00')
    expect(formatOfferMoney(729.95, '$')).toBe('$729.95')
  })
})
