jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    cart: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
  },
}))

jest.mock('@/lib/payments/cashfree-adapter', () => ({
  cashfreeAdapter: { verifyWebhookSignature: jest.fn(() => true) },
}))

jest.mock('@/lib/payments/recovery', () => ({
  handlePaymentFailure: jest.fn(async () => undefined),
}))

jest.mock('@/lib/alerter', () => ({
  sendAlert: jest.fn(async () => undefined),
}))

import prisma from '@/lib/db'
import { resolveCustomerContact } from '../contact'

const mockCartFind = prisma.cart.findFirst as jest.Mock
const mockCustomerFind = prisma.customer.findFirst as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('resolveCustomerContact', () => {
  it('uses the matching cart contact', async () => {
    mockCartFind.mockResolvedValue({ customerEmail: 'ada@example.com', customerPhone: null })
    await expect(resolveCustomerContact('store-1', 'order-1')).resolves.toEqual({
      email: 'ada@example.com',
      phone: undefined,
    })
    expect(mockCustomerFind).not.toHaveBeenCalled()
  })

  it('does not fall back to an unrelated customer', async () => {
    mockCartFind.mockResolvedValue(null)
    mockCustomerFind.mockResolvedValue({ email: 'someone@example.com', phone: '+919999999999' })
    await expect(resolveCustomerContact('store-1', 'order-1')).resolves.toBeUndefined()
    expect(mockCustomerFind).not.toHaveBeenCalled()
  })
})
