const mockPrisma = {
  cart: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  customer: { findMany: jest.fn() },
  bargainSession: { findMany: jest.fn() },
  optOut: { findMany: jest.fn() },
  customerDataExport: {
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
}

jest.mock('@/lib/db', () => mockPrisma)
jest.mock('@/lib/services/email', () => ({
  sendEmail: jest.fn(),
}))
jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(),
}))

// eslint-disable-next-line import/no-extraneous-dependencies
const { sendEmail } = require('@/lib/services/email')
// eslint-disable-next-line import/no-extraneous-dependencies
const { logDataAccess } = require('@/lib/data-protection')

import {
  normalizeCustomerId,
  collectCustomerData,
  createCustomerDataExport,
  deliverCustomerDataExportToMerchant,
} from '../data-export'

describe('normalizeCustomerId', () => {
  it('strips the gid wrapper', () => {
    expect(normalizeCustomerId('gid://shopify/Customer/123456')).toBe('123456')
  })
  it('passes plain ids through', () => {
    expect(normalizeCustomerId('987654')).toBe('987654')
    expect(normalizeCustomerId(424242)).toBe('424242')
  })
  it('returns null for empty / missing values', () => {
    expect(normalizeCustomerId(null)).toBeNull()
    expect(normalizeCustomerId(undefined)).toBeNull()
    expect(normalizeCustomerId('')).toBeNull()
  })
})

describe('collectCustomerData', () => {
  beforeEach(() => jest.clearAllMocks())

  it('gathers carts, customers, bargain sessions and opt-outs for one identity', async () => {
    mockPrisma.cart.findMany.mockResolvedValue([
      {
        id: 'cart_1',
        cartId: 'tok_abc',
        customerEmail: 'a@test.com',
        customerPhone: '+919000000000',
        customerName: 'A',
        items: [{ name: 'Widget', price: 100 }],
        totalValue: 100,
        currency: 'INR',
        abandonedAt: new Date('2026-01-01'),
        convertedAt: null,
        isRecovered: true,
        recoveredAt: new Date(),
        recoveredCart: { recoveredValue: 95, channel: 'whatsapp', refundStatus: 'none' },
        messages: [{ id: 'm1', channel: 'email', content: 'hi', status: 'sent', sentAt: new Date() }],
      },
    ])
    mockPrisma.customer.findMany.mockResolvedValue([
      {
        id: 'cust_db_1',
        customerId: '9001',
        email: 'a@test.com',
        phone: null,
        totalOrders: 2,
        codOrders: 0,
        codRtos: 0,
        cancellations: 0,
        firstOrderAt: new Date(),
        lastOrderAt: new Date(),
        intentType: 'retaining',
        intentScore: 0.8,
        customerInsights: [{ id: 'ins_1', intentType: 'retaining', intentScore: 0.8, lifetimeValue: 200 }],
      },
    ])
    mockPrisma.bargainSession.findMany.mockResolvedValue([
      {
        id: 'bs_1',
        shopifyProductId: '101',
        cartToken: 'tok_abc',
        customerEmail: 'a@test.com',
        customerPhone: null,
        originalPrice: 1000,
        finalPrice: 850,
        discountCode: 'SAVE15',
        attemptsUsed: 2,
        status: 'accepted',
        language: 'en',
        startedAt: new Date(),
        expiredAt: new Date(),
        messages: [{ id: 'bm1', role: 'ai', content: 'deal', offeredPrice: 850, createdAt: new Date() }],
      },
    ])
    mockPrisma.optOut.findMany.mockResolvedValue([
      { id: 'oo1', email: 'a@test.com', phone: null, reason: 'asked', optedOutAt: new Date() },
    ])

    const payload = (await collectCustomerData({
      storeId: 'store_1',
      shopifyCustomerId: '9001',
      email: 'A@TEST.com',
    })) as Record<string, any>

    expect(payload!.counts).toEqual({ carts: 1, customers: 1, bargainSessions: 1, optOuts: 1 })
    expect(payload.carts[0].cartId).toBe('tok_abc')
    expect(payload.carts[0].recoveredValue).toBe(95)
    expect(payload.customers[0].shopifyCustomerId).toBe('9001')
    expect(payload.bargainSessions[0].discountCode).toBe('SAVE15')
    expect(payload.optOuts[0].reason).toBe('asked')

    // The email was normalized to lowercase for matching.
    const cartCall = mockPrisma.cart.findMany.mock.calls[0][0]
    expect(cartCall.where.OR).toContainEqual({ customerEmail: 'a@test.com' })
  })

  it('matches by customerId (Shopify redact path supplies no email)', async () => {
    mockPrisma.cart.findMany.mockResolvedValue([])
    mockPrisma.customer.findMany.mockResolvedValue([])
    mockPrisma.bargainSession.findMany.mockResolvedValue([])
    mockPrisma.optOut.findMany.mockResolvedValue([])

    await collectCustomerData({ storeId: 'store_1', shopifyCustomerId: '444' })

    expect(mockPrisma.cart.findMany.mock.calls[0][0].where.OR).toContainEqual({ customerId: { equals: '444' } })
  })
})

describe('createCustomerDataExport / delivery', () => {
  beforeEach(() => jest.clearAllMocks())

  it('persists an export row with status ready', async () => {
    mockPrisma.customerDataExport.create.mockResolvedValue({ id: 'exp_1', status: 'ready' })
    const row = await createCustomerDataExport({ storeId: 's', shopifyCustomerId: '1', payload: { a: 1 } })
    expect(row.id).toBe('exp_1')
    expect(mockPrisma.customerDataExport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'ready', shopifyCustomerId: '1' }),
    })
  })

  it('marks export delivered and audit-logs when email succeeds', async () => {
    mockPrisma.customerDataExport.update.mockResolvedValue({})
    sendEmail.mockResolvedValue({ success: true, messageId: 'msg_1' })

    const result = await deliverCustomerDataExportToMerchant({
      storeId: 's',
      storeDomain: 'test.myshopify.com',
      ownerEmail: 'owner@test.com',
      exportId: 'exp_1',
      shopifyCustomerId: '9',
    })

    expect(result.sent).toBe(true)
    expect(mockPrisma.customerDataExport.update).toHaveBeenCalledWith({
      where: { id: 'exp_1' },
      data: { status: 'delivered' },
    })
    expect(logDataAccess).toHaveBeenCalled()
  })

  it('does not attempt delivery without a merchant email', async () => {
    const result = await deliverCustomerDataExportToMerchant({
      storeId: 's',
      storeDomain: 'test.myshopify.com',
      ownerEmail: null,
      exportId: 'exp_1',
    })
    expect(result.sent).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})