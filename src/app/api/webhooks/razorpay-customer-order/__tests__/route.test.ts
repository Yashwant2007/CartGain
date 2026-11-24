import { NextRequest } from 'next/server'
import { GET, POST } from '../route'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainQuote: { findUnique: jest.fn() },
    platformConnection: { findUnique: jest.fn() },
    webhookEvent: { create: jest.fn() },
  },
}))

const original = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
const request = (body = '') =>
  new NextRequest('https://cart-gain.com/api/webhooks/razorpay-customer-order', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
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

it('exposes a non-sensitive readiness probe', async () => {
  const body = await (await GET()).json()
  expect(body).toMatchObject({ status: 'ok', provider: 'razorpay', scope: 'customer_order' })
})
