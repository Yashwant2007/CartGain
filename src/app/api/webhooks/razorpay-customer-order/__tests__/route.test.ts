import { NextRequest } from 'next/server'
import { GET, POST } from '../route'
import prisma from '@/lib/db'
import { verifyCustomerPaymentWebhook } from '@/lib/customer-payments/razorpay'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainQuote: { findFirst: jest.fn() },
    platformConnection: { findMany: jest.fn() },
    webhookEvent: { create: jest.fn() },
  },
}))

jest.mock('@/lib/encryption', () => ({
  decrypt: jest.fn((value: string) => `decrypted:${value}`),
}))

jest.mock('@/lib/customer-payments/razorpay', () => {
  const actual = jest.requireActual('@/lib/customer-payments/razorpay')
  return {
    ...actual,
    verifyCustomerPaymentWebhook: jest.fn(() => true),
    normalizeCustomerPaymentEvent: jest.fn(() => ({
      quoteId: 'q1',
      referenceId: 'ref-1',
      amountMinor: 85000,
      currency: 'INR',
      entityId: 'pay_1',
      event: 'payment.captured',
      captured: true,
      failed: false,
    })),
  }
})

const original = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
const prismaMock = prisma as any
const verifyMock = verifyCustomerPaymentWebhook as jest.Mock
const request = (body = '', signature = 'valid-signature') =>
  new NextRequest('https://cart-gain.com/api/webhooks/razorpay-customer-order', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
  })

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  prismaMock.platformConnection.findMany.mockResolvedValue([
    { storeId: 'store-1', webhookSecret: 'enc-secret' },
  ])
  prismaMock.bargainQuote.findFirst.mockResolvedValue(null)
  verifyMock.mockReturnValue(true)
})

afterAll(() => {
  if (original == null) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = original
})

it('keeps the customer payment webhook hidden when the flag is off', async () => {
  expect((await POST(request('{}'))).status).toBe(404)
})

it('rejects malformed bodies when the flag is on', async () => {
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  const res = await POST(request('not-json'))
  expect(res.status).toBe(400)
  expect((await res.json()).message).toContain('Invalid webhook body')
})

it('rejects an invalid signature before any quote lookup', async () => {
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  verifyMock.mockReturnValue(false)

  const res = await POST(request('{}', 'bad-signature'))

  expect(res.status).toBe(401)
  expect(prismaMock.bargainQuote.findFirst).not.toHaveBeenCalled()
})

it('scopes the quote lookup to verified store ids', async () => {
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  prismaMock.bargainQuote.findFirst.mockResolvedValue({
    id: 'q1',
    storeId: 'store-1',
    status: 'ACCEPTED',
    finalPrice: 850,
    currency: 'INR',
    conditions: {},
  })

  const res = await POST(request('{}'))

  expect(res.status).toBe(200)
  expect(prismaMock.bargainQuote.findFirst).toHaveBeenCalledWith({
    where: { id: 'q1', storeId: { in: ['store-1'] } },
    select: expect.objectContaining({ id: true, storeId: true }),
  })
  expect((await res.json()).reason).toBe('reference_mismatch')
})

it('exposes a non-sensitive readiness probe', async () => {
  const body = await (await GET()).json()
  expect(body).toMatchObject({ status: 'ok', provider: 'razorpay', scope: 'customer_order' })
})
