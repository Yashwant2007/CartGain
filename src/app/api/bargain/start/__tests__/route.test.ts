/**
 * @jest-environment node
 */
import { POST } from '@/app/api/bargain/start/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findUnique: jest.fn(), update: jest.fn() },
    bargainConfig: { upsert: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
    bargainSession: { findFirst: jest.fn(), create: jest.fn() },
    bargainPurchaseMemory: { findMany: jest.fn() },
    cart: { findUnique: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}))

jest.mock('@/lib/bargain/i18n', () => ({
  currencySymbolFor: jest.fn(() => '$'),
  formatMoney: jest.fn((value: number) => `$${value.toFixed(2)}`),
  CURRENCY_SYMBOLS: { USD: '$', INR: '₹' },
  uiText: jest.fn(() => ''),
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('@/lib/shopify', () => ({
  fetchShopifyProductPrice: jest.fn(async () => null),
}))

jest.mock('@/lib/services/bargain', () => ({
  ...jest.requireActual('@/lib/services/bargain'),
  buildOpeningMessage: jest.fn(() => 'Welcome'),
  buildCustomerContext: jest.fn(async () => null),
  computeMinPrice: jest.fn(async () => ({ minPrice: 800, isBargainable: true, reason: null })),
}))

jest.mock('@/lib/bargain/goals', () => ({
  buildGoalContextForNegotiation: jest.fn(async () => null),
  publicGoalView: jest.fn(() => undefined),
}))

jest.mock('@/lib/bargain/gate', () => ({
  getBargainGate: jest.fn(async () => ({ sessionsExhausted: false, subscriptionId: null, planId: 'free' })),
  recordBargainSessionOp: jest.fn(() => ({})),
  BARGAIN_SESSIONS_EXHAUSTED: 'BARGAIN_SESSIONS_EXHAUSTED',
}))

jest.mock('@/lib/bargain/purchase', () => ({
  generateClaimToken: jest.fn(() => 'tok'),
}))

jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(async () => {}),
}))

jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(async () => {}),
}))

const db = prisma as unknown as {
  store: { findUnique: jest.Mock; update: jest.Mock }
  bargainConfig: { upsert: jest.Mock }
  bargainProduct: { findUnique: jest.Mock }
  bargainSession: { findFirst: jest.Mock; create: jest.Mock }
  bargainPurchaseMemory: { findMany: jest.Mock }
  cart: { findUnique: jest.Mock }
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('https://cart-gain.com/api/bargain/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      storeId: 'store-1',
      shopifyProductId: 'gid://shopify/Product/1',
      originalPrice: 1000,
      ...body,
    }),
  }) as any
}

const purchase = {
  shopifyOrderId: 'order-77',
  shopifyProductId: 'gid://shopify/Product/55',
  variantId: null,
  productTitle: 'Trail Runner',
  price: 79,
  currency: 'USD',
  purchasedAt: new Date('2026-11-10T10:00:00Z'),
}

const existingSession = {
  id: 'existing-session',
  shopifyProductId: 'gid://shopify/Product/1',
  originalPrice: 1000,
  currentOffer: 1000,
  finalPrice: null,
  status: 'active',
  attemptsUsed: 1,
  language: 'en',
  startedAt: new Date('2026-11-18T09:00:00Z'),
  expiredAt: new Date('2026-11-19T09:00:00Z'),
  customerFingerprint: 'fp-12345678',
  cartToken: 'cart-1',
  messages: [{ id: 'm1', role: 'ai', content: 'Welcome back', offeredPrice: null, createdAt: new Date() }],
}

beforeEach(() => {
  jest.clearAllMocks()
  db.store.findUnique.mockResolvedValue({
    id: 'store-1',
    isActive: true,
    name: 'Test Store',
    currency: 'USD',
    timezone: 'UTC',
  })
  db.store.update.mockResolvedValue({ id: 'store-1', currency: 'USD', timezone: 'UTC', name: 'Test Store' })
  db.bargainConfig.upsert.mockResolvedValue({
    enabled: true,
    sessionTimeout: 600,
    maxAttempts: 3,
    language: 'auto',
    minProfitPercent: 20,
  })
  db.bargainProduct.findUnique.mockResolvedValue(null)
  db.bargainSession.findFirst.mockResolvedValue(null)
  db.bargainSession.create.mockResolvedValue({ id: 'new-session', messages: [] })
  db.bargainPurchaseMemory.findMany.mockResolvedValue([])
  db.cart.findUnique.mockResolvedValue(null)
})

describe('/api/bargain/start — ownership-aware rejoin and disclosure', () => {
  it('does not rejoin or disclose session data for an email/phone-only match', async () => {
    db.bargainPurchaseMemory.findMany.mockResolvedValue([purchase])

    const res = await POST(makeRequest({
      customerEmail: 'buyer@example.com',
      customerPhone: '+911234567890',
    }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.sessionId).toBe('new-session')
    expect(body.sessionToken).toBeTruthy()
    expect(body.lastBought).toBeNull()
    expect(db.bargainSession.findFirst).toHaveBeenCalledTimes(1)
    expect(body).not.toHaveProperty('existingSession')
  })

  it('does not leak lastBought for an email-only checkout lock', async () => {
    db.bargainSession.findFirst.mockResolvedValueOnce({
      id: 'victim-session',
      customerFingerprint: null,
      cartToken: null,
      checkoutOpenedAt: new Date('2026-11-18T10:00:00Z'),
      checkoutPurchaseAt: null,
    })
    db.bargainPurchaseMemory.findMany.mockResolvedValue([purchase])

    const res = await POST(makeRequest({ customerEmail: 'buyer@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.locked).toBe(true)
    expect(body.lastBought).toBeNull()
    expect(body.sessionId).toBeUndefined()
    expect(body.sessionToken).toBeUndefined()
    expect(body.session).toBeUndefined()
  })

  it('rejoins and discloses lastBought for a strong fingerprint + cart-token match', async () => {
    db.bargainSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingSession)
    db.bargainPurchaseMemory.findMany.mockResolvedValue([purchase])

    const res = await POST(makeRequest({
      customerFingerprint: 'fp-12345678',
      cartToken: 'cart-1',
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.existingSession).toBe(true)
    expect(body.sessionId).toBe('existing-session')
    expect(body.sessionToken).toBeTruthy()
    expect(body.session).toMatchObject({ id: 'existing-session', attemptsUsed: 1 })
    expect(body.lastBought).toMatchObject({ orderId: 'order-77', productTitle: 'Trail Runner' })
  })

  it('rejoins with a cart token alone', async () => {
    db.bargainSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingSession)

    const res = await POST(makeRequest({ cartToken: 'cart-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sessionId).toBe('existing-session')
    expect(body.session).toMatchObject({ id: 'existing-session' })
  })

  it('rejoins when the caller presents a valid signed session token', async () => {
    db.bargainSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingSession)

    const res = await POST(makeRequest({ sessionToken: signSessionToken('existing-session') }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sessionId).toBe('existing-session')
    const rejoinWhere = db.bargainSession.findFirst.mock.calls[1][0].where
    expect(rejoinWhere.OR).toContainEqual({ id: 'existing-session' })
  })

  it('ignores an expired or foreign signed token', async () => {
    db.bargainSession.findFirst.mockResolvedValue(null)

    const res = await POST(makeRequest({ sessionToken: signSessionToken('some-other-session') }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.sessionId).toBe('new-session')
    expect(db.bargainSession.findFirst).toHaveBeenCalledTimes(3)
  })
})
