import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { GET, PUT, DELETE } from '../route'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    platformConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    platformCredential: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/encryption', () => ({ encrypt: jest.fn((value) => `enc:${value}`) }))

const authMock = getServerSession as jest.Mock
const request = () => new NextRequest('https://cart-gain.com/api/merchant/customer-payments/razorpay?storeId=store-1')
const original = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue(null)
  delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
})

afterAll(() => {
  if (original == null) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
  else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = original
})

it('hides the merchant payment credential route when the flag is off', async () => {
  expect((await GET(request())).status).toBe(404)
  expect((await PUT(request())).status).toBe(404)
  expect((await DELETE(request())).status).toBe(404)
})

it('requires authentication when the flag is on', async () => {
  process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'true'
  expect((await GET(request())).status).toBe(401)
  expect((await PUT(request())).status).toBe(401)
  expect((await DELETE(request())).status).toBe(401)
})
