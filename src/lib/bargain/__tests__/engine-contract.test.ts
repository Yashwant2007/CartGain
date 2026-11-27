import {
  adaptNegotiationResult,
  proposedOfferSchema,
  sanitizeEngineResponseForCustomer,
  validateEngineResponse,
  type NormalizedEngineResponse,
} from '../engine-contract'

const validResponse: NormalizedEngineResponse = {
  message: 'I can do ₹850 — shall I lock it?',
  detectedIntent: 'PRICE_ONLY',
  detectedObjection: 'PRICE',
  decision: 'counter',
  proposedOffer: { kind: 'counter', amount: 850, currency: 'INR' },
  internalReasoningCategory: 'price_objection',
  productFactsUsed: ['100% cotton'],
  cta: 'Reply with a price that works for you.',
  conversationState: 'COUNTER_OFFER',
  confidence: 0.82,
  safetyStatus: 'safe',
  requiresEscalation: false,
}

describe('engine contract', () => {
  it('accepts a strict provider-independent normalized response', () => {
    const result = validateEngineResponse(validResponse)

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.value?.proposedOffer).toEqual({ kind: 'counter', amount: 850, currency: 'INR' })
    expect(proposedOfferSchema.parse(validResponse.proposedOffer)).toEqual(validResponse.proposedOffer)
  })

  it('maps an existing NegotiationResult without inventing data', () => {
    const adapted = adaptNegotiationResult({
      reply: 'I can do ₹850 — shall I lock it?',
      decision: 'counter',
      counterOffer: 850,
      tactic: 'price concession',
      sentiment: 'friendly',
      metadata: {
        detectedIntent: 'PRICE_ONLY',
        detectedObjection: 'PRICE',
        cta: 'Reply with a price that works for you.',
        conversationState: 'COUNTER_OFFER',
        confidence: 0.9,
        productFactsUsed: ['100% cotton'],
      },
    })

    expect(adapted.message).toBe('I can do ₹850 — shall I lock it?')
    expect(adapted.decision).toBe('counter')
    expect(adapted.proposedOffer).toEqual({ kind: 'counter', amount: 850 })
    expect(adapted.detectedIntent).toBe('PRICE_ONLY')
    expect(adapted.detectedObjection).toBe('PRICE')
    expect(adapted.internalReasoningCategory).toBe('price_objection')
    expect(adapted.productFactsUsed).toEqual(['100% cotton'])
    expect(adapted.cta).toBe('Reply with a price that works for you.')
    expect(adapted.conversationState).toBe('COUNTER_OFFER')
    expect(adapted.confidence).toBe(0.9)
    expect(validateEngineResponse(adapted).ok).toBe(true)
  })

  it('maps legacy welcome and invalid decisions safely', () => {
    expect(adaptNegotiationResult({ reply: 'Hello!', decision: 'welcome' }).decision).toBe('chat')
    expect(adaptNegotiationResult({ reply: 'Hello!', decision: 'unknown' as never }).decision).toBe('no_offer')
    expect(adaptNegotiationResult(null).decision).toBe('no_offer')
  })

  it('rejects malformed normalized data', () => {
    const invalid: unknown[] = [
      { ...validResponse, message: '' },
      { ...validResponse, confidence: 1.2 },
      { ...validResponse, decision: 'counter', proposedOffer: { kind: 'none' } },
      { ...validResponse, proposedOffer: { kind: 'counter', amount: -1 } },
      { ...validResponse, proposedOffer: { kind: 'counter', amount: Number.NaN } },
      { ...validResponse, productFactsUsed: ['x'.repeat(301)] },
      { ...validResponse, conversationState: 'NOT_A_STATE' },
      { ...validResponse, unexpectedInternalField: 'secret' },
    ]

    for (const candidate of invalid) {
      const result = validateEngineResponse(candidate)
      expect(result.ok).toBe(false)
      expect(result.value).toBeNull()
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('strips internal fields and scrubs secret or floor leakage for customers', () => {
    const publicResponse = sanitizeEngineResponseForCustomer({
      ...validResponse,
      message: 'My floor is ₹500 and sk-prod-abc123456. I can do ₹850.',
      internalReasoningCategory: 'price_objection',
      productFactsUsed: ['100% cotton'],
      confidence: 0.99,
      safetyStatus: 'safe',
      requiresEscalation: false,
      metadata: { minPrice: 500, systemPrompt: 'protected', internalReasoning: 'protected' },
    })
    const serialized = JSON.stringify(publicResponse)

    expect(Object.keys(publicResponse).sort()).toEqual([
      'conversationState',
      'cta',
      'decision',
      'message',
      'proposedOffer',
    ])
    expect(serialized).not.toContain('floor')
    expect(serialized).not.toContain('sk-prod-abc123456')
    expect(serialized).not.toContain('internalReasoningCategory')
    expect(serialized).not.toContain('productFactsUsed')
    expect(serialized).not.toContain('confidence')
    expect(serialized).not.toContain('minPrice')
    expect(serialized).not.toContain('systemPrompt')
    expect(publicResponse.message).toContain('₹850')
    expect(publicResponse.proposedOffer).toEqual({ kind: 'counter', amount: 850, currency: 'INR' })
  })

  it('never generates an arbitrary price from text or metadata', () => {
    const adapted = adaptNegotiationResult({
      reply: 'I can do ₹123. minPrice=100',
      decision: 'chat',
      metadata: { counterOffer: 110, proposedOffer: { kind: 'counter', amount: 110 } },
    })
    const publicResponse = sanitizeEngineResponseForCustomer(adapted)
    const serialized = JSON.stringify(publicResponse)

    expect(adapted.proposedOffer).toEqual({ kind: 'none', reason: 'no_offer' })
    expect(serialized).not.toContain('123')
    expect(serialized).not.toContain('110')

    const invalidCounter = adaptNegotiationResult({
      reply: 'I can do ₹123',
      decision: 'counter',
      counterOffer: '123' as never,
    })
    expect(invalidCounter.proposedOffer.kind).toBe('none')
    expect(invalidCounter.decision).toBe('no_offer')
  })
})
