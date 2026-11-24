import { NextRequest } from 'next/server'
import { POST } from '../route'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { bargainSession: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/bargain/quote', () => ({
  loadQuoteByToken: jest.fn(),
  markQuoteCheckoutPending: jest.fn(),
}))
jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
  clientIp: jest.fn(() => '127.0.0.1'),
}))

const originalFlag = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
const originalQuote = process.env.BARGAIN_QUOTE
const request = (body: unknown = {}) =>
  new NextRequest('https://cart-gain.com/api/bargain/customer-payment-link', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  delete process.env.BARGAIN_QUOTE
})

afterAll(() => {
  if (originalFlag == null) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = originalFlag
  if (originalQuote == null) delete process.env.BARGAIN_QUOTE
  else process.env.BARGAIN_QUOTE = originalQuote
})

it('hides the customer payment link route until both flags are on', async () => {
  expect((await POST(request())).status).toBe(404)
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  expect((await POST(request())).status).toBe(404)
})

it('validates quoteToken when the route is enabled', async () => {
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  process.env.BARGAIN_QUOTE = 'true'
  const res = await POST(request({}))
  expect(res.status).toBe(400)
  expect((await res.json()).message).toContain('quoteToken')
})
