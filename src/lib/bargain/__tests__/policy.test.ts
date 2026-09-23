import {
  bargainCampaignStatus,
  detectCouponMention,
  detectMultiProductRequest,
  couponMentionedInMessages,
} from '../policy'

describe('detectCouponMention (§24)', () => {
  it('catches explicit coupon/promo/voucher/discount-code mentions', () => {
    expect(detectCouponMention('Can I also apply my coupon?')).toBe(true)
    expect(detectCouponMention('I have a promo code: SAVE20')).toBe(true)
    expect(detectCouponMention('use code FLAT10 at checkout')).toBe(true)
    expect(detectCouponMention('I got a voucher from the mailer')).toBe(true)
    expect(detectCouponMention('can you take my discount code too?')).toBe(true)
    expect(detectCouponMention('I have a referral code from a friend')).toBe(true)
    expect(detectCouponMention('50OFF coupon please')).toBe(true)
    expect(detectCouponMention('do you have any promo running?')).toBe(true)
  })

  it('does not flag ordinary negotiation phrases', () => {
    expect(detectCouponMention('can you do a better price?')).toBe(false)
    expect(detectCouponMention('what is your best offer?')).toBe(false)
    expect(detectCouponMention('the price is good')).toBe(false)
    expect(detectCouponMention('code red alert')).toBe(false)
    expect(detectCouponMention('free shipping code')).toBe(false)
    expect(detectCouponMention('')).toBe(false)
    expect(detectCouponMention('  ')).toBe(false)
  })

  it('flags a bare code token right after a keyword', () => {
    expect(detectCouponMention('promo WOW-50-2026')).toBe(true)
    expect(detectCouponMention('voucher SUMMER')).toBe(true)
  })
})

describe('couponMentionedInMessages (§24 accept-path)', () => {
  it('scans the whole transcript, most-recent irrelevant to detection', () => {
    expect(couponMentionedInMessages([])).toBe(false)
    expect(couponMentionedInMessages([{ content: null }])).toBe(false)
    expect(couponMentionedInMessages([{ content: 'make it 850' }, { content: 'I have a coupon' }])).toBe(true)
    expect(couponMentionedInMessages([{ content: 'make it 850' }])).toBe(false)
  })
})

describe('bargainCampaignStatus (§25)', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  const early = new Date('2026-09-23T10:00:00Z')
  const late = new Date('2026-09-23T14:00:00Z')

  it('no campaign window → always active', () => {
    expect(bargainCampaignStatus(null, now)).toBe('active')
    expect(bargainCampaignStatus({}, now)).toBe('active')
    expect(bargainCampaignStatus(undefined, now)).toBe('active')
  })

  it('actively inside a configured window', () => {
    expect(bargainCampaignStatus({ campaignStart: early, campaignEnd: late }, now)).toBe('active')
    // String-typed windows (DB serialization) also work
    expect(bargainCampaignStatus({ campaignStart: early.toISOString(), campaignEnd: late.toISOString() }, now)).toBe('active')
  })

  it('inactive before start and after end (inclusive end bound)', () => {
    const before = new Date('2026-09-23T09:00:00Z')
    const atClose = new Date('2026-09-23T14:00:00Z')
    const after = new Date('2026-09-23T15:00:00Z')
    expect(bargainCampaignStatus({ campaignStart: early, campaignEnd: late }, before)).toBe('inactive')
    expect(bargainCampaignStatus({ campaignStart: early, campaignEnd: late }, atClose)).toBe('inactive')
    expect(bargainCampaignStatus({ campaignStart: early, campaignEnd: late }, after)).toBe('inactive')
  })

  it('handles invalid/boundary windows without throwing (fails open, config route guards writes)', () => {
    expect(bargainCampaignStatus({ campaignStart: 'not-a-date', campaignEnd: 'nope' }, now)).toBe('active')
    expect(bargainCampaignStatus({ campaignStart: early }, now)).toBe('active')
  })
})

describe('detectMultiProductRequest (§27)', () => {
  it('flags bundle/combo/package language', () => {
    expect(detectMultiProductRequest('give me a bundle deal')).toBe(true)
    expect(detectMultiProductRequest('can you do a combo offer?')).toBe(true)
    expect(detectMultiProductRequest('cheapest bundle price')).toBe(true)
    expect(detectMultiProductRequest('what about a package deal?')).toBe(true)
  })

  it('flags explicit multi-item phrasing', () => {
    expect(detectMultiProductRequest("I'll take the serum and moisturizer together")).toBe(true)
    expect(detectMultiProductRequest('buy both of them')).toBe(true)
    expect(detectMultiProductRequest('give me both')).toBe(true)
    expect(detectMultiProductRequest('serum plus moisturizer')).toBe(true)
    expect(detectMultiProductRequest('let me get these two')).toBe(true)
    expect(detectMultiProductRequest('deal on both')).toBe(true)
    expect(detectMultiProductRequest('price as a set')).toBe(true)
    expect(detectMultiProductRequest('take them all three')).toBe(true)
  })

  it('does NOT flag same-product bulk (multiples of ONE SKU)', () => {
    expect(detectMultiProductRequest('2 bottles of serum please')).toBe(false)
    expect(detectMultiProductRequest('serum x3')).toBe(false)
    expect(detectMultiProductRequest('3 serum')).toBe(false)
    expect(detectMultiProductRequest('give me 2')).toBe(false)
    expect(detectMultiProductRequest('how much for 10 units?')).toBe(false)
    expect(detectMultiProductRequest('discount if I buy 5?')).toBe(false)
  })

  it('does not flag ordinary single-product negotiation', () => {
    expect(detectMultiProductRequest('can you do 850 for this one?')).toBe(false)
    expect(detectMultiProductRequest('what is your best price?')).toBe(false)
    expect(detectMultiProductRequest('I like the blue one')).toBe(false)
    expect(detectMultiProductRequest('please and thank you')).toBe(false)
    expect(detectMultiProductRequest('')).toBe(false)
  })
})