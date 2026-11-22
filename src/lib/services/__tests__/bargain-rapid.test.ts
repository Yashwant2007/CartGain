jest.mock('@/lib/ai-client', () => ({
  getAiClient: jest.fn(),
  getFallbackAiClient: jest.fn(),
  getPrimaryAiClient: jest.fn(),
  fallbackModelName: jest.fn(() => 'fallback-model'),
  primaryTimeoutMs: jest.fn(() => 10_000),
  fallbackTimeoutMs: jest.fn(() => 20_000),
  bargainTotalTimeoutMs: jest.fn(() => 30_000),
  handleAiFailure: jest.fn(),
  classifyAiFailure: jest.fn(() => 'unknown'),
}))

import { getAiClient } from '@/lib/ai-client'
import { analyzeLiveTurn } from '@/lib/bargain/live-turn'
import { negotiateStep, type NegotiationContext } from '@/lib/services/bargain'

describe('negotiateStep rapid low-information path', () => {
  const ctx = (message: string, overrides: Partial<NegotiationContext> = {}): NegotiationContext => ({
    storeName: 'Test Store',
    currencySymbol: '₹',
    originalPrice: 1000,
    minPrice: 800,
    attemptsUsed: 0,
    maxAttempts: 3,
    persona: 'friendly_shopkeeper',
    productTitle: 'Trail Shoes',
    language: 'en',
    liveTurn: analyzeLiveTurn({ message }),
    ...overrides,
  })

  beforeEach(() => jest.clearAllMocks())

  it('answers a greeting without touching the model provider', async () => {
    const result = await negotiateStep(ctx('hello'), [], 'hello')

    expect(result.decision).toBe('chat')
    expect(result.tactic).toBe('rapid_reply')
    expect(result.counterOffer ?? null).toBeNull()
    expect((result.metadata as any)?.aiSource).toBe('reflex')
    expect(getAiClient).not.toHaveBeenCalled()
  })

  it('keeps real price turns on the normal model path', async () => {
    const result = await negotiateStep(
      ctx('can you do 900?', { liveTurn: analyzeLiveTurn({ message: 'can you do 900?', customerOffer: 900 }) }),
      [],
      'can you do 900?',
      900,
    )

    expect(getAiClient).toHaveBeenCalled()
    expect(result.tactic).not.toBe('rapid_reply')
  })

  it('does not rapid-reply after a deal is accepted', async () => {
    const result = await negotiateStep(ctx('hello', { dealAccepted: true, acceptedPrice: 900 }), [], 'hello')

    expect(getAiClient).toHaveBeenCalled()
    expect(result.tactic).not.toBe('rapid_reply')
  })

  it('does not rapid-reply when claims manipulation was detected', async () => {
    const result = await negotiateStep(ctx('hello', { claims: { manipulation: true } as any }), [], 'hello')

    expect(getAiClient).toHaveBeenCalled()
    expect(result.tactic).not.toBe('rapid_reply')
  })
})
