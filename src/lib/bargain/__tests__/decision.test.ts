import {
  ruleBasedDecision,
  retentionOffer,
  bulkFloorFactor,
  buildOpeningMessage,
  computeMinPrice,
  negotiateStep,
  type NegotiationContext,
} from '@/lib/services/bargain'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainConfig: { findUnique: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
  },
}))

let mockCreateFn: jest.Mock | null = null

jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat: any
    constructor(_opts: any) {
      this.chat = {
        completions: {
          create: (...args: any[]) => {
            if (!mockCreateFn) throw new Error('no AI mock configured')
            return mockCreateFn(...args)
          },
        },
      }
    }
  },
}))

function mockAIResponse(createMock: jest.Mock) {
  mockCreateFn = createMock
}

function baseCtx(overrides: Partial<NegotiationContext> = {}): NegotiationContext {
  return {
    storeName: 'Test Store',
    currencySymbol: '₹',
    originalPrice: 100,
    minPrice: 80,
    attemptsUsed: 0,
    maxAttempts: 3,
    persona: 'friendly_shopkeeper',
    ...overrides,
  }
}

const prismaMock = prisma as unknown as {
  bargainConfig: { findUnique: jest.Mock }
  bargainProduct: { findUnique: jest.Mock }
}

describe('ruleBasedDecision', () => {
  it('accepts offers at or above the floor', () => {
    const result = ruleBasedDecision(85, baseCtx())
    expect(result.decision).toBe('accept')
    expect(result.counterOffer).toBe(85)
    expect(result.tactic).toBe('accept_at_floor')
  })

  it('accepts an offer exactly at the floor', () => {
    const result = ruleBasedDecision(80, baseCtx())
    expect(result.decision).toBe('accept')
  })

  it('engages lowballs playfully without jumping to the floor', () => {
    const result = ruleBasedDecision(15, baseCtx())
    expect(result.decision).toBe('counter')
    expect(result.tactic).toBe('graduated_open')
    // First attempt: counter near original price, not the floor
    expect(result.counterOffer).toBe(100)
  })

  it('counters below-floor offers with a graduated counter early on', () => {
    const result = ruleBasedDecision(50, baseCtx())
    expect(result.decision).toBe('counter')
    expect(result.tactic).toBe('meet_partway')
  })

  it('gives the final floor offer on the last attempt', () => {
    const ctx = baseCtx({ attemptsUsed: 2 })
    const result = ruleBasedDecision(50, ctx)
    expect(result.decision).toBe('counter')
    expect(result.tactic).toBe('final_offer')
    expect(result.counterOffer).toBe(80)
  })
})

describe('retentionOffer', () => {
  it('steps down from the last counter without going below the floor', () => {
    const result = retentionOffer(baseCtx(), 90)
    expect(result.decision).toBe('counter')
    expect(result.tactic).toBe('walkout_retention')
    expect(result.counterOffer).toBeLessThan(90)
    expect(result.counterOffer!).toBeGreaterThanOrEqual(80)
  })

  it('uses original price as baseline when no counter exists', () => {
    const result = retentionOffer(baseCtx(), null)
    expect(result.counterOffer).toBe(98.4)
  })

  it('respects the floor when the last counter is near it', () => {
    const result = retentionOffer(baseCtx(), 81)
    expect(result.counterOffer).toBe(80)
  })

  it('adapts tone per persona', () => {
    expect(retentionOffer(baseCtx({ persona: 'friendly_shopkeeper' }), 90).reply).toContain('friend')
    expect(retentionOffer(baseCtx({ persona: 'strict_negotiator' }), 90).reply).toContain('adjustment')
    expect(retentionOffer(baseCtx({ persona: 'playful_friend' }), 90).reply).toContain('FINAL')
  })
})

describe('bulkFloorFactor', () => {
  it('unlocks deeper floors for larger orders only', () => {
    expect(bulkFloorFactor(2)).toBe(1)
    expect(bulkFloorFactor(4)).toBe(1)
    expect(bulkFloorFactor(5)).toBe(0.95)
    expect(bulkFloorFactor(10)).toBe(0.9)
    expect(bulkFloorFactor(20)).toBe(0.85)
    expect(bulkFloorFactor(100)).toBe(0.85)
  })
})

describe('buildOpeningMessage', () => {
  const ctx = baseCtx()
  it('greets warmly by default', () => {
    expect(buildOpeningMessage(ctx)).toContain('Welcome')
    expect(buildOpeningMessage(ctx)).toContain('₹100.00')
  })
  it('uses the strict persona tone', () => {
    expect(buildOpeningMessage({ ...ctx, persona: 'strict_negotiator' })).toContain('Thank you for your interest')
  })
  it('uses the playful persona tone', () => {
    expect(buildOpeningMessage({ ...ctx, persona: 'playful_friend' })).toContain('😏')
  })
  it('acknowledges returning customers', () => {
    expect(buildOpeningMessage({ ...ctx, customerContext: 'past sessions' })).toContain('So good to see you again')
  })
})

describe('computeMinPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('blocks when bargaining is disabled', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: false })
    prismaMock.bargainProduct.findUnique.mockResolvedValue(null)
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.isBargainable).toBe(false)
    expect(result.reason).toBe('bargain_disabled')
  })

  it('blocks when the product is not bargainable', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true })
    prismaMock.bargainProduct.findUnique.mockResolvedValue({ isBargainable: false })
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.isBargainable).toBe(false)
    expect(result.reason).toBe('product_not_bargainable')
  })

  it('uses the merchant-set absolute floor and clamps it to original price', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, minProfitPercent: 20 })
    prismaMock.bargainProduct.findUnique.mockResolvedValue({ minPrice: 60, isBargainable: true })
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.minPrice).toBe(60)
  })

  it('applies bulk factor to the absolute floor', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true })
    prismaMock.bargainProduct.findUnique.mockResolvedValue({ minPrice: 60, isBargainable: true })
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100, bulkQuantity: 10 })
    expect(result.minPrice).toBe(54)
  })

  it('defaults to 20% profit protection when no override exists', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, minProfitPercent: 20 })
    prismaMock.bargainProduct.findUnique.mockResolvedValue(null)
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.minPrice).toBe(80)
  })

  it('uses the store-wide profit percent when set', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, minProfitPercent: 30 })
    prismaMock.bargainProduct.findUnique.mockResolvedValue(null)
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.minPrice).toBe(70)
  })

  it('applies maxDiscountPercent as a cap tighter than the profit floor', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, minProfitPercent: 20 })
    prismaMock.bargainProduct.findUnique.mockResolvedValue({ maxDiscountPercent: 15, isBargainable: true })
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.minPrice).toBe(85)
  })

  it('deepens the floor for bulk orders', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, minProfitPercent: 20 })
    prismaMock.bargainProduct.findUnique.mockResolvedValue(null)
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100, bulkQuantity: 20 })
    expect(result.minPrice).toBe(68)
  })

  it('never returns a floor above the original price', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true })
    prismaMock.bargainProduct.findUnique.mockResolvedValue({ minPrice: 500 })
    const result = await computeMinPrice({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 100 })
    expect(result.minPrice).toBe(100)
  })
})

describe('negotiateStep (AI unavailable — rule-based fallback)', () => {
  beforeAll(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('falls back to rule-based accept when the offer clears the floor', async () => {
    const result = await negotiateStep(baseCtx(), [], 'I can pay 85', 85)
    expect(result.decision).toBe('accept')
    expect(result.counterOffer).toBe(85)
  })

  it('counters low offers via rules', async () => {
    const result = await negotiateStep(baseCtx(), [], 'I can pay 50', 50)
    expect(result.decision).toBe('counter')
  })

  it('produces an opening message when no offer is present', async () => {
    const result = await negotiateStep(baseCtx(), [], 'I\'m interested', undefined)
    expect(result.decision).toBe('chat')
    expect(result.reply).toContain('Welcome')
  })
})

describe('negotiateStep (AI available — safety overrides)', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key'
  })
  it('honours an AI accept when the offer is at or above the floor', async () => {
    mockAIResponse(jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Done!', decision: 'accept', counterOffer: 85, tactic: 'accept', sentiment: 'happy' }) } }],
    }))
    const result = await negotiateStep(baseCtx(), [], 'I can pay 85', 85)
    expect(result.decision).toBe('accept')
  })

  it('downgrades an AI accept when the offer is below the floor', async () => {
    mockAIResponse(jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Sure!', decision: 'accept', counterOffer: 50, tactic: 'accept', sentiment: 'happy' }) } }],
    }))
    const result = await negotiateStep(baseCtx(), [], 'I can pay 50', 50)
    expect(result.decision).toBe('counter')
  })

  it('does not force the floor on early attempts when AI counter is below it', async () => {
    mockAIResponse(jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'How about 60?', decision: 'counter', counterOffer: 60, tactic: 'trial', sentiment: 'neutral' }) } }],
    }))
    const result = await negotiateStep(baseCtx({ attemptsUsed: 1 }), [], 'I can pay 50', 50)
    expect(result.decision).toBe('counter')
    expect(result.counterOffer).toBeGreaterThan(60)
    expect(result.counterOffer).toBeLessThan(100)
  })

  it('forces the floor on the final attempts when AI counter is below it', async () => {
    mockAIResponse(jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'How about 60?', decision: 'counter', counterOffer: 60, tactic: 'trial', sentiment: 'neutral' }) } }],
    }))
    const result = await negotiateStep(baseCtx({ attemptsUsed: 2 }), [], 'I can pay 50', 50)
    expect(result.counterOffer).toBe(80)
  })

  it('falls back to rules when the AI response is not valid JSON', async () => {
    mockAIResponse(jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }],
    }))
    const result = await negotiateStep(baseCtx(), [], 'I can pay 50', 50)
    expect(result.decision).toBe('counter')
  })

  it('falls back to rules when the API call throws', async () => {
    mockAIResponse(jest.fn().mockRejectedValue(new Error('network down')))
    const result = await negotiateStep(baseCtx(), [], 'I can pay 50', 50)
    expect(result.decision).toBe('counter')
  })
})
