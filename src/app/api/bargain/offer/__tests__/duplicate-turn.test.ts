import { POST } from '@/app/api/bargain/offer/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'
import { track } from '@/lib/analytics/track'
import { recordLearningEvent } from '@/lib/bargain/learning/service'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    bargainConfig: { findUnique: jest.fn() },
    merchantConfig: { findUnique: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
    bargainMessage: { create: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}))

jest.mock('@/lib/data-protection', () => ({ logDataAccess: jest.fn(async () => {}) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))
jest.mock('@/lib/bargain/product-fetcher', () => ({ buildProductContext: jest.fn(async () => null) }))
jest.mock('@/lib/bargain/goals', () => ({
  buildGoalContextForNegotiation: jest.fn(async () => undefined),
  publicGoalView: jest.fn(() => undefined),
}))
jest.mock('@/lib/bargain/learning/service', () => ({
  resolveSessionLearning: jest.fn(async () => null),
  recordLearningEvent: jest.fn(async () => {}),
  loadLearningConfig: jest.fn(async () => null),
}))
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn(async () => []) }))

let modelCalls = 0
jest.mock('@/lib/services/bargain', () => {
  const actual = jest.requireActual('@/lib/services/bargain')
  return {
    ...actual,
    negotiateStep: jest.fn(async () => {
      modelCalls += 1
      return {
        reply: 'I can do 450',
        decision: 'counter',
        counterOffer: 450,
        tactic: 'final_offer',
        sentiment: 'neutral',
        metadata: {},
      }
    }),
  }
})

const prismaMock = prisma as unknown as {
  bargainSession: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
  merchantConfig: { findUnique: jest.Mock }
  bargainProduct: { findUnique: jest.Mock }
  bargainMessage: { create: jest.Mock }
  $transaction: jest.Mock
}
const trackMock = track as jest.Mock
const learningMock = recordLearningEvent as jest.Mock

function request(turnId?: string, message = 'give me 400') {
  return new Request('https://cart-gain.com/api/bargain/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'sess-1',
      message,
      sessionToken: signSessionToken('sess-1'),
      ...(turnId ? { turnId } : {}),
    }),
  }) as any
}

function session(messages: any[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    shopifyProductId: 'gid://shopify/Product/1',
    originalPrice: 600,
    currentOffer: 400,
    finalPrice: null,
    discountCode: null,
    purchaseUrl: null,
    claimToken: null,
    status: 'active',
    attemptsUsed: 1,
    customerEmail: null,
    customerPhone: null,
    language: 'auto',
    store: { id: 'store-1', currency: 'USD', timezone: 'UTC', name: 'Test Store' },
    messages,
    ...overrides,
  }
}

const completedTurn = [
  {
    id: 'm1',
    role: 'customer',
    content: 'give me 400',
    offeredPrice: 400,
    metadata: { turnId: 'turn-1' },
    createdAt: new Date('2026-11-17T10:00:00.000Z'),
  },
  {
    id: 'm2',
    role: 'ai',
    content: 'I can do 450',
    offeredPrice: 450,
    metadata: {
      turnId: 'turn-1',
      decision: 'counter',
      tactic: 'final_offer',
      bargainIntelligence: { conversationState: 'COUNTER_OFFER', strategy: 'VALUE_FOCUS' },
      publicIntelligence: {
        schemaVersion: 1,
        customer: { readiness: 'evaluating', engagement: 'medium', urgency: 'normal', productKnowledge: 'aware', claimRisk: 'none', offerBasis: 'single', offerQuantity: 1, offerClarificationNeeded: false },
        state: { current: 'COUNTER_OFFER', terminal: false },
        recommendation: 'none',
        metrics: { llmCalls: 0, deterministic: true },
      },
      offerBasis: 'single',
      offerQuantity: 1,
      offerRawAmount: 400,
      offerUnitAmount: 400,
      offerTotal: 400,
      offerClarificationNeeded: false,
    },
    createdAt: new Date('2026-11-17T10:00:01.000Z'),
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  modelCalls = 0
  prismaMock.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainSession.update.mockResolvedValue({})
  prismaMock.bargainMessage.create.mockResolvedValue({})
  prismaMock.bargainConfig.findUnique.mockResolvedValue({
    enabled: true,
    maxAttempts: 3,
    aiPersona: 'friendly_shopkeeper',
    language: 'auto',
    recommendationsEnabled: false,
    alternativeRecommendationsEnabled: false,
  })
  prismaMock.merchantConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainProduct.findUnique.mockResolvedValue({ minPrice: 300, isBargainable: true })
})

describe('offer route turn idempotency', () => {
  it('replays the stored reply for a duplicate turn without writing or charging', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(session(completedTurn))

    const res = await POST(request('turn-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      reply: 'I can do 450',
      decision: 'counter',
      counterOffer: 450,
      sessionStatus: 'active',
      sessionId: 'sess-1',
      attemptsUsed: 1,
      floorReached: true,
      duplicateTurn: true,
      conversationState: 'COUNTER_OFFER',
      offerInterpretation: { basis: 'single', quantity: 1, rawAmount: 400, unitAmount: 400, totalAmount: 400, needsClarification: false },
    })
    expect(body.negotiationIntelligence).toMatchObject({
      state: { current: 'COUNTER_OFFER', terminal: false },
      metrics: { llmCalls: 0, deterministic: true },
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.bargainMessage.create).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.update).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.updateMany).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
    expect(learningMock).not.toHaveBeenCalled()
    expect(modelCalls).toBe(0)
  })

  it('replays terminal offer fields for a duplicate turn after the session closed', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(session([
      {
        role: 'customer',
        content: 'give me 100',
        offeredPrice: 100,
        metadata: { turnId: 'turn-2' },
      },
      {
        role: 'ai',
        content: 'That is below my floor',
        offeredPrice: null,
        metadata: { turnId: 'turn-2', tactic: 'reject_graceful' },
      },
    ], {
      status: 'rejected',
      attemptsUsed: 3,
      discountCode: 'GAIN123',
      purchaseUrl: 'https://cart-gain.com/r/abc',
      claimToken: 'claim-token',
    }))

    const res = await POST(request('turn-2', 'give me 100'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      reply: 'That is below my floor',
      decision: 'chat',
      sessionStatus: 'rejected',
      finalPrice: null,
      attemptsUsed: 3,
      terminal: true,
      duplicateTurn: true,
      discountCode: 'GAIN123',
      purchaseUrl: 'https://cart-gain.com/r/abc',
    })
    expect(body.claimUrl).toBeTruthy()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.updateMany).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
    expect(modelCalls).toBe(0)
  })

  it('persists turnId on both messages of a new turn', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(session())

    const res = await POST(request('turn-3'))
    expect(res.status).toBe(200)

    const created = prismaMock.bargainMessage.create.mock.calls.map(([args]) => args.data)
    expect(created.find((m: any) => m.role === 'customer').metadata.turnId).toBe('turn-3')
    expect(created.find((m: any) => m.role === 'ai').metadata.turnId).toBe('turn-3')
    expect(prismaMock.bargainSession.updateMany).toHaveBeenCalled()
  })

  it('does not replay when the turnId is new', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(session(completedTurn))

    const res = await POST(request('turn-4'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.duplicateTurn).toBeUndefined()
    expect(modelCalls).toBe(1)
    expect(prismaMock.$transaction).toHaveBeenCalled()
  })
})
