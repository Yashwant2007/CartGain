import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { POST } from '../route'
import {
  loadQuoteByToken,
  markQuoteCheckoutPending,
  signQuoteToken,
  verifyQuoteToken,
} from '@/lib/bargain/quote'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    bargainQuote: { findUnique: jest.fn(), updateMany: jest.fn() },
    bargainQuoteEvent: { create: jest.fn() },
    bargainSession: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    platformConnection: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/bargain/quote', () => {
  const actual = jest.requireActual('@/lib/bargain/quote')
  return {
    ...actual,
    loadQuoteByToken: jest.fn(),
    markQuoteCheckoutPending: jest.fn(),
  }
})

jest.mock('@/lib/encryption', () => ({
  decrypt: jest.fn((value: string) => (value === 'key' ? 'kid-test' : 'ksecret-test')),
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
  clientIp: jest.fn(() => '127.0.0.1'),
}))

const mockPrisma = prisma as any
const quoteId = 'quote-customer-payment'
const baseTime = 1_800_000_000_000
const providerPayload = { id: 'pl_1', url: 'https://rzp.test/link/pl_1' }

const originalFlag = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
const originalQuoteFlag = process.env.BARGAIN_QUOTE
const originalPlatforms = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS
const originalFetch = global.fetch

let quoteToken: string
let state: {
  quote: any
  claimCount: number
  finalCount: number
  finalConflict: boolean
  blockClaim: boolean
  version: number
}
let fetchMock: jest.Mock

function clone<T>(value: T): T {
  const structured = (globalThis as any).structuredClone
  return structured ? structured(value) : JSON.parse(JSON.stringify(value))
}

function providerResponse(ok = true, status = 200, payload: unknown = providerPayload) {
  return { ok, status, json: async () => payload }
}

function request(body: unknown = {}) {
  return new NextRequest('https://cart-gain.com/api/bargain/customer-payment-link', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function validBody(extra: Record<string, unknown> = {}) {
  return {
    quoteToken,
    customerFingerprint: 'fp-1',
    cartToken: 'cart-1',
    ...extra,
  }
}

function nextVersion() {
  state.version += 1
  return new Date(baseTime + state.version)
}

function handleUpdate(args: any) {
  const dataConditions = args.data?.conditions ?? {}
  if (dataConditions.customerPaymentPending) {
    if (state.claimCount > 0 || state.blockClaim) return { count: 0 }
    state.claimCount += 1
    state.quote = {
      ...state.quote,
      conditions: clone(dataConditions),
      updatedAt: nextVersion(),
    }
    return { count: 1 }
  }

  const requestId = args.where?.conditions?.equals
  if (typeof requestId === 'string') {
    if (dataConditions.customerPayment) {
      if (state.finalConflict || state.quote.conditions.customerPaymentPending?.requestId !== requestId) {
        return { count: 0 }
      }
      state.finalCount += 1
      state.quote = {
        ...state.quote,
        status: 'CHECKOUT_PENDING',
        conditions: clone(dataConditions),
        updatedAt: nextVersion(),
      }
      return { count: 1 }
    }
    if (state.quote.conditions.customerPaymentPending?.requestId === requestId) {
      const next = clone(state.quote.conditions)
      delete next.customerPaymentPending
      state.quote = { ...state.quote, conditions: next, updatedAt: nextVersion() }
      return { count: 1 }
    }
    return { count: 0 }
  }
  return { count: 1 }
}

function setup(overrides: Record<string, unknown> = {}) {
  quoteToken = signQuoteToken(quoteId)!
  state = {
    quote: {
      id: quoteId,
      storeId: 'store-1',
      sessionId: 'sess-1',
      cartToken: 'cart-1',
      customerFingerprint: 'fp-1',
      customerEmail: 'buyer@example.com',
      finalPrice: 1250.5,
      currency: 'INR',
      expiresAt: new Date(baseTime + 60 * 60 * 1000),
      status: 'ACCEPTED',
      conditions: {},
      updatedAt: new Date(baseTime - 1000),
      ...overrides,
    },
    claimCount: 0,
    finalCount: 0,
    finalConflict: false,
    blockClaim: false,
    version: 0,
  }

  ;(loadQuoteByToken as jest.Mock).mockImplementation(async (token: string) =>
    verifyQuoteToken(quoteId, token) ? clone(state.quote) : null,
  )
  ;(markQuoteCheckoutPending as jest.Mock).mockImplementation(async ({ id, status }: any) => ({
    id,
    status: status === 'CHECKOUT_PENDING' ? 'CHECKOUT_PENDING' : 'CHECKOUT_PENDING',
  }))

  mockPrisma.bargainSession.findUnique.mockResolvedValue({
    customerFingerprint: 'fp-1',
    cartToken: 'cart-1',
  })
  mockPrisma.store.findUnique.mockResolvedValue({ id: 'store-1', platform: 'woocommerce' })
  mockPrisma.platformConnection.findUnique.mockResolvedValue({
    id: 'conn-1',
    status: 'active',
    credentials: [{ keyEncrypted: 'key', secretEncrypted: 'secret' }],
  })
  mockPrisma.bargainQuoteEvent.create.mockResolvedValue({ id: 'event-1' })
  mockPrisma.$transaction.mockImplementation(async (arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
  )
  mockPrisma.bargainQuote.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === quoteId ? clone(state.quote) : null,
  )
  mockPrisma.bargainQuote.updateMany.mockImplementation(async (args: any) => handleUpdate(args))

  fetchMock = jest.fn(async (url: string) =>
    String(url).endsWith('/cancel') ? providerResponse(true, 200, {}) : providerResponse(),
  )
  global.fetch = fetchMock as any
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  process.env.BARGAIN_QUOTE = 'true'
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS = 'woocommerce'
  setup()
})

afterAll(() => {
  if (originalFlag == null) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = originalFlag
  if (originalQuoteFlag == null) delete process.env.BARGAIN_QUOTE
  else process.env.BARGAIN_QUOTE = originalQuoteFlag
  if (originalPlatforms == null) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS
  else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS = originalPlatforms
  global.fetch = originalFetch
})

it('hides the customer payment link route until both flags are on', async () => {
  delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  expect((await POST(request())).status).toBe(404)
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  delete process.env.BARGAIN_QUOTE
  expect((await POST(request())).status).toBe(404)
})

it('validates quoteToken when the route is enabled', async () => {
  const res = await POST(request({}))
  expect(res.status).toBe(400)
  expect((await res.json()).message).toContain('quoteToken')
})

it('creates one link and replays it idempotently with intact response fields', async () => {
  const initialUpdatedAt = state.quote.updatedAt
  const first = await POST(request(validBody()))
  expect(first.status).toBe(200)
  const firstBody = await first.json()
  expect(firstBody).toEqual(expect.objectContaining({ idempotent: false, quoteStatus: 'CHECKOUT_PENDING' }))
  expect(firstBody.paymentLink).toEqual(expect.objectContaining({
    provider: 'razorpay',
    id: providerPayload.id,
    url: providerPayload.url,
    referenceId: `cgq_${quoteId}`,
    status: 'active',
  }))

  const claimCall = mockPrisma.bargainQuote.updateMany.mock.calls.find(
    (call: any[]) => call[0].data?.conditions?.customerPaymentPending,
  )
  expect(claimCall).toBeDefined()
  expect(claimCall[0].where).toEqual(expect.objectContaining({
    id: quoteId,
    updatedAt: initialUpdatedAt,
    status: { in: ['ACCEPTED', 'CHECKOUT_PENDING'] },
  }))
  expect(claimCall[0].where.AND).toHaveLength(2)
  expect(claimCall[0].data.conditions.customerPaymentPending.requestId).toEqual(expect.any(String))

  const finalCall = mockPrisma.bargainQuote.updateMany.mock.calls.find(
    (call: any[]) => call[0].data?.conditions?.customerPayment,
  )
  expect(finalCall).toBeDefined()
  expect(finalCall[0].where.conditions).toEqual({
    path: ['customerPaymentPending', 'requestId'],
    equals: claimCall[0].data.conditions.customerPaymentPending.requestId,
  })
  expect(finalCall[0].where.updatedAt.getTime()).toEqual(expect.any(Number))
  expect(mockPrisma.bargainQuoteEvent.create).toHaveBeenCalledTimes(1)
  expect(markQuoteCheckoutPending).toHaveBeenCalledTimes(1)

  const second = await POST(request(validBody()))
  expect(second.status).toBe(200)
  const secondBody = await second.json()
  expect(secondBody.idempotent).toBe(true)
  expect(secondBody.quoteStatus).toBe('CHECKOUT_PENDING')
  expect(secondBody.paymentLink.id).toBe(firstBody.paymentLink.id)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(mockPrisma.bargainQuoteEvent.create).toHaveBeenCalledTimes(1)
})

it('lets only one concurrent claim reach the provider', async () => {
  let releaseProvider: (() => void) | null = null
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/cancel')) return providerResponse(true, 200, {})
    await new Promise<void>((resolve) => {
      releaseProvider = resolve
    })
    return providerResponse()
  })

  const first = POST(request(validBody()))
  const second = POST(request(validBody()))
  for (let i = 0; i < 50 && (!releaseProvider || mockPrisma.bargainQuote.updateMany.mock.calls.filter(
    (call: any[]) => call[0].data?.conditions?.customerPaymentPending,
  ).length < 2); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(releaseProvider).not.toBeNull()
  ;(releaseProvider as unknown as () => void)()

  const results = await Promise.all([first, second])
  expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  expect(fetchMock.mock.calls.filter((call: any[]) => !String(call[0]).endsWith('/cancel'))).toHaveLength(1)
  expect(mockPrisma.bargainQuoteEvent.create).toHaveBeenCalledTimes(1)
  expect(state.finalCount).toBe(1)
})

it('returns an idempotent link when a race produced a persisted link', async () => {
  const persisted = {
    provider: 'razorpay',
    id: 'pl_existing',
    url: 'https://rzp.test/link/pl_existing',
    expiresAt: new Date(baseTime + 10 * 60 * 1000).toISOString(),
    status: 'active',
  }
  state.blockClaim = true
  state.quote.status = 'CHECKOUT_PENDING'
  state.quote.conditions = { customerPayment: persisted }

  const res = await POST(request(validBody()))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    paymentLink: persisted,
    quoteStatus: 'CHECKOUT_PENDING',
    idempotent: true,
  })
  expect(fetchMock).not.toHaveBeenCalled()
  expect(mockPrisma.bargainQuote.updateMany).not.toHaveBeenCalled()
})

it('clears the claim and keeps the network failure response shape', async () => {
  fetchMock.mockRejectedValueOnce(new Error('network'))
  const res = await POST(request(validBody()))
  expect(res.status).toBe(502)
  expect(await res.json()).toEqual({ message: 'Payment provider is unavailable' })
  expect(state.quote.conditions.customerPaymentPending).toBeUndefined()
  expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  expect(markQuoteCheckoutPending).not.toHaveBeenCalled()
})

it('clears the claim and keeps the provider rejection response shape', async () => {
  fetchMock.mockResolvedValueOnce(providerResponse(false, 400, { error: 'bad_request' }))
  const res = await POST(request(validBody()))
  expect(res.status).toBe(502)
  expect(await res.json()).toEqual({
    message: 'Payment provider rejected the request',
    providerStatus: 400,
  })
  expect(state.quote.conditions.customerPaymentPending).toBeUndefined()
  expect(mockPrisma.$transaction).not.toHaveBeenCalled()
})

it('reclaims an expired pending marker', async () => {
  state.quote.conditions = {
    customerPaymentPending: {
      requestId: 'stale-request',
      expiresAt: new Date(baseTime - 60_000).toISOString(),
      expiresAtMs: baseTime - 60_000,
    },
  }

  const res = await POST(request(validBody()))
  expect(res.status).toBe(200)
  expect((await res.json()).paymentLink.id).toBe(providerPayload.id)
  expect(state.quote.conditions.customerPaymentPending).toBeUndefined()
  expect(state.quote.conditions.customerPayment.id).toBe(providerPayload.id)
  const claimCall = mockPrisma.bargainQuote.updateMany.mock.calls.find(
    (call: any[]) => call[0].data?.conditions?.customerPaymentPending,
  )
  expect(claimCall[0].data.conditions.customerPaymentPending.requestId).not.toBe('stale-request')
})

it('rejects a fresh pending marker without calling the provider', async () => {
  state.blockClaim = true
  state.quote.conditions = {
    customerPaymentPending: {
      requestId: 'live-request',
      expiresAt: new Date(baseTime + 60_000).toISOString(),
      expiresAtMs: baseTime + 60_000,
    },
  }

  const res = await POST(request(validBody()))
  expect(res.status).toBe(409)
  expect((await res.json()).message).toContain('already in progress')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('cancels an unpersisted link when finalization loses its CAS', async () => {
  state.finalConflict = true
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

  const res = await POST(request(validBody()))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body).not.toHaveProperty('paymentLink')
  expect(body.message).toContain('conflict')

  const cancelCall = fetchMock.mock.calls.find((call: any[]) => String(call[0]).endsWith('/cancel'))
  expect(cancelCall).toBeDefined()
  expect(String(cancelCall[1].headers.Authorization)).toMatch(/^Basic /)
  expect(mockPrisma.bargainQuoteEvent.create).not.toHaveBeenCalled()
  expect(markQuoteCheckoutPending).not.toHaveBeenCalled()
  expect(state.quote.conditions.customerPayment).toBeUndefined()
  expect(state.quote.conditions.customerPaymentPending).toBeUndefined()
  expect(JSON.stringify(logSpy.mock.calls)).not.toContain('ksecret-test')
  expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('ksecret-test')
  logSpy.mockRestore()
  errorSpy.mockRestore()
})

it('still checks the quote status and buyer ownership before claiming', async () => {
  setup({ status: 'REDEEMED' })
  const statusRes = await POST(request(validBody()))
  expect(statusRes.status).toBe(409)
  expect((await statusRes.json()).message).toContain('REDEEMED')
  expect(fetchMock).not.toHaveBeenCalled()
  expect(mockPrisma.bargainQuote.updateMany).not.toHaveBeenCalled()

  setup()
  const ownerRes = await POST(request(validBody({ customerFingerprint: 'attacker', cartToken: 'other' })))
  expect(ownerRes.status).toBe(403)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(mockPrisma.bargainQuote.updateMany).not.toHaveBeenCalled()
})
