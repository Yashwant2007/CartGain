const deleteMany = jest.fn()
const update = jest.fn()

const mockPrisma = {
  store: {
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  paymentAttempt: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  paymentRecoveryCampaign: {
    deleteMany: jest.fn(),
  },
  cart: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  message: { deleteMany: jest.fn() },
  recoveredCart: { deleteMany: jest.fn() },
  bargainMessage: { deleteMany: jest.fn() },
  bargainSession: { findMany: jest.fn(), deleteMany: jest.fn(), delete: jest.fn() },
  customer: { findFirst: jest.fn(), delete: jest.fn() },
  customerInsight: { deleteMany: jest.fn() },
  optOut: { deleteMany },
  customerDataExport: { deleteMany: jest.fn() },
  analytics: { deleteMany: jest.fn() },
  dataAccessLog: { deleteMany: jest.fn() },
  $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  $transaction: jest.fn(),
}

jest.mock('@/lib/db', () => mockPrisma)
jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(),
}))

import { purgeStoreData, redactCustomer } from '../data-deletion'

describe('purgeStoreData', () => {
  beforeEach(() => jest.clearAllMocks())

  it('purges payment-pipeline rows keyed by merchantId (= store id)', async () => {
    mockPrisma.paymentAttempt.findMany.mockResolvedValue([{ id: 'att_1' }, { id: 'att_2' }])
    mockPrisma.paymentAttempt.deleteMany.mockResolvedValue({ count: 2 })
    mockPrisma.paymentRecoveryCampaign.deleteMany.mockResolvedValue({ count: 2 })
    mockPrisma.analytics.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.dataAccessLog.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.store.delete.mockResolvedValue({})

    const result = await purgeStoreData({ id: 'store_1', domain: 'a.myshopify.com', userId: 'user_1' })

    expect(mockPrisma.paymentAttempt.findMany).toHaveBeenCalledWith({
      where: { merchantId: 'store_1' },
      select: { id: true },
    })
    expect(mockPrisma.paymentRecoveryCampaign.deleteMany).toHaveBeenCalledWith({
      where: { attemptId: { in: ['att_1', 'att_2'] } },
    })
    expect(mockPrisma.paymentAttempt.deleteMany).toHaveBeenCalledWith({
      where: { merchantId: 'store_1' },
    })
    expect(result.deletedRows).toBeGreaterThanOrEqual(2)
  })
})

describe('redactCustomer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('matches carts by raw OR gid-normalized customer id variants', async () => {
    mockPrisma.store.findFirst.mockResolvedValue({ id: 'store_1', userId: 'user_1' })
    mockPrisma.cart.findMany.mockResolvedValue([
      { id: 'cart_1', cartId: 'tok_abc' },
    ])
    mockPrisma.cart.findUnique.mockResolvedValue({
      id: 'cart_1',
      customerEmail: 'a@example.com',
      customerPhone: '+919876543210',
    })
    mockPrisma.cart.delete.mockResolvedValue({})
    mockPrisma.bargainSession.findMany.mockResolvedValue([{ id: 'sess_1' }])
    mockPrisma.bargainSession.delete.mockResolvedValue({})
    mockPrisma.customer.findFirst.mockResolvedValue(null)
    mockPrisma.customerDataExport.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.optOut.deleteMany.mockResolvedValue({ count: 1 })

    const result = await redactCustomer('a.myshopify.com', 'gid://shopify/Customer/8877')

    // Both raw and normalized variants must be offered to the cart lookup so the
    // ids match regardless of how Shopify delivered them.
    const cartWhere = mockPrisma.cart.findMany.mock.calls[0][0].where
    expect(cartWhere.OR.some((o: any) => o.customerId === 'gid://shopify/Customer/8877')).toBe(true)
    expect(cartWhere.OR.some((o: any) => o.customerId === '8877')).toBe(true)

    // Opt-out consent rows carrying that email/phone must also be erased.
    const optWhere = mockPrisma.optOut.deleteMany.mock.calls[0][0].where
    expect(optWhere.storeId).toBe('store_1')
    expect(optWhere.OR.some((o: any) => o.email === 'a@example.com')).toBe(true)
    expect(optWhere.OR.some((o: any) => o.phone === '+919876543210')).toBe(true)

    expect(result.affected).toBeGreaterThanOrEqual(2)
  })
})