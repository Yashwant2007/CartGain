import { POST } from '@/app/api/bargain/offer/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'
import { track } from '@/lib/analytics/track'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    merchantConfig: { findUnique: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
    bargainMessage: { create: jest.fn() },
    bargainTurnClaim: { create: jest.fn(async () => ({})), delete: jest.fn(async () => ({})) },
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
  bargainTurnClaim: { create: jest.Mock; delete: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
}
const trackMock = track as jest.Mock

function request(message: string) {
  return new Request('https://cart-gain.com/api/bargain/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'sess-human',
      message,
      sessionToken: signSessionToken('sess-human'),
    }),
  }) as any
}

beforeEach(() => {
  modelCalls = 0
  jest.clearAllMocks()
  prismaMock.bargainSession.findUnique.mockResolvedValue({
    id: 'sess-human',
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

it('stops automated negotiation and tracks explicit human handoff', async () => {
  const res = await POST(request('I want to speak to a human'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.terminal).toBe(true)
  expect(body.status).toBe('abandoned')
  expect(body.escalation).toBe('human_support_required')
  expect(body.terminationKind).toBe('human_support')
  expect(body.conversationState).toBe('HUMAN_SUPPORT_REQUIRED')
  expect(body.engineResponse.decision).toBe('escalate')
  expect(modelCalls).toBe(0)
  expect(prismaMock.bargainSession.update).toHaveBeenCalledWith({
    where: { id: 'sess-human' },
    data: { status: 'abandoned' },
  })
  expect(trackMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'cartgain_bargain_human_support' }))
})

it('stops automated negotiation on explicit opt-out phrases', async () => {
  const res = await POST(request('please do not contact me'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.terminal).toBe(true)
  expect(body.status).toBe('abandoned')
  expect(body.terminationKind).toBe('opt_out')
  expect(body.conversationState).toBe('CANCELLED')
  expect(body.engineResponse.decision).toBe('no_offer')
  expect(modelCalls).toBe(0)
})
