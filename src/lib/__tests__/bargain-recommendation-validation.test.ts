import { bargainOfferSchema, bargainRecommendEventSchema } from '../validation/bargain'

describe('bargainRecommendEventSchema', () => {
  it('accepts dismissal and rejection feedback', () => {
    for (const action of ['dismissed', 'rejected'] as const) {
      expect(bargainRecommendEventSchema.safeParse({
        sessionId: 'sess-1',
        action,
        productId: 'gid://shopify/Product/42',
        customerFingerprint: 'fingerprint-1',
      }).success).toBe(true)
    }
  })

  it('still accepts the legacy clicked and added actions', () => {
    for (const action of ['clicked', 'added'] as const) {
      expect(bargainRecommendEventSchema.safeParse({
        sessionId: 'sess-1',
        action,
        productId: '42',
      }).success).toBe(true)
    }
  })

  it('accepts viewed feedback', () => {
    expect(bargainRecommendEventSchema.safeParse({
      sessionId: 'sess-1',
      action: 'viewed',
      productId: '42',
    }).success).toBe(true)
  })

  it('rejects unknown actions', () => {
    expect(bargainRecommendEventSchema.safeParse({
      sessionId: 'sess-1',
      action: 'purchased',
      productId: '42',
    }).success).toBe(false)
  })
})

describe('bargainOfferSchema', () => {
  it('accepts an optional turnId within the bound', () => {
    expect(bargainOfferSchema.safeParse({
      sessionId: 'sess-1',
      message: 'I can do 450',
      turnId: 'turn-1',
    }).success).toBe(true)
    expect(bargainOfferSchema.safeParse({
      sessionId: 'sess-1',
      message: 'I can do 450',
    }).success).toBe(true)
  })

  it('rejects an oversized turnId', () => {
    expect(bargainOfferSchema.safeParse({
      sessionId: 'sess-1',
      message: 'I can do 450',
      turnId: 'x'.repeat(101),
    }).success).toBe(false)
  })
})
