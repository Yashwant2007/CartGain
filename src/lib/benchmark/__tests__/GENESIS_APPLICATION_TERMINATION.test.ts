import { POST } from '@/app/api/bargain/offer/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'
import { analyzeIntent } from '@/lib/bargain/intent'
import { deriveConversationState } from '@/lib/bargain/conversation-state'
import { track } from '@/lib/analytics/track'
import { GENESIS_SCENARIOS } from '@/lib/benchmark/genesis/dataset'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    bargainTurnClaim: { create: jest.fn(async () => ({})), delete: jest.fn(async () => ({})) },
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
      return { reply: 'unexpected', decision: 'chat', metadata: {} }
    }),
  }
})

const prismaMock = prisma as unknown as {
  bargainSession: { findUnique: jest.Mock; update: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
}
const trackMock = track as jest.Mock
const sessionId = 'sess-genesis-termination'

const optOutScenario = GENESIS_SCENARIOS.find((scenario) => scenario.kind === 'opt_out')
const humanSupportScenario = GENESIS_SCENARIOS.find((scenario) => scenario.metadata?.needHumanSupport === true)

function request(message: string) {
  return new Request('https://cart-gain.com/api/bargain/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message,
      sessionToken: signSessionToken(sessionId),
    }),
  }) as any
}

beforeEach(() => {
  modelCalls = 0
  jest.clearAllMocks()
  prismaMock.bargainSession.findUnique.mockResolvedValue({
    id: sessionId,
    shopifyProductId: 'gid://shopify/Product/1',
    originalPrice: 3499,
    currentOffer: 3000,
    finalPrice: null,
    discountCode: null,
    purchaseUrl: null,
    claimToken: null,
    status: 'active',
    expiredAt: new Date(Date.now() + 60_000),
    attemptsUsed: 1,
    customerEmail: null,
    customerPhone: null,
    language: 'auto',
    store: { id: 'store-1', domain: 'test.myshopify.com', currency: 'INR', timezone: 'UTC', name: 'Test Store' },
    messages: [],
  })
  prismaMock.bargainConfig.findUnique.mockResolvedValue({
    enabled: true,
    maxAttempts: 3,
    sessionTimeout: 86400,
    language: 'auto',
  })
})

describe('GENESIS application-level termination', () => {
  it('flags both benchmark scenarios at the application boundary', () => {
    expect(optOutScenario).toBeDefined()
    expect(humanSupportScenario).toBeDefined()
    expect(analyzeIntent(optOutScenario!.message).optOutRequested).toBe(true)
    const intent = analyzeIntent(humanSupportScenario!.message)
    expect(intent.needHumanSupport).toBe(true)
    expect(deriveConversationState({
      attemptsUsed: 0,
      intent: intent.intent,
      needHumanSupport: true,
    })).toBe('HUMAN_SUPPORT_REQUIRED')
  })

  it('terminates the benchmark opt-out scenario before any model call', async () => {
    const res = await POST(request(optOutScenario!.message))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.terminal).toBe(true)
    expect(body.status).toBe('abandoned')
    expect(modelCalls).toBe(0)
    expect(prismaMock.bargainSession.update).toHaveBeenCalledWith({
      where: { id: sessionId },
      data: { status: 'abandoned' },
    })
  })

  it('terminates the benchmark human-support scenario with escalation', async () => {
    const res = await POST(request(humanSupportScenario!.message))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.terminal).toBe(true)
    expect(body.status).toBe('abandoned')
    expect(body.escalation).toBe('human_support_required')
    expect(modelCalls).toBe(0)
    expect(prismaMock.bargainSession.update).toHaveBeenCalledWith({
      where: { id: sessionId },
      data: { status: 'abandoned' },
    })
    expect(trackMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'cartgain_bargain_human_support',
    }))
  })
})
