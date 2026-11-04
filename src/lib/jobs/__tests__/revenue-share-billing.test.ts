jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    subscription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    revenueShareEvent: { findMany: jest.fn(), updateMany: jest.fn() },
    bargainRevenueShareEvent: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/services/email', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/shopify-billing/service', () => ({
  resolveShopifyStoreForUser: jest.fn(),
  reconcileShopifySubscription: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/shopify-billing/subscriptions', () => ({
  recordShopifyUsage: jest.fn(),
}))

import prisma from '@/lib/db'
import { sendEmail } from '@/lib/services/email'
import { resolveShopifyStoreForUser } from '@/lib/shopify-billing/service'
import { recordShopifyUsage } from '@/lib/shopify-billing/subscriptions'
import { buildRevenueShareInvoiceEmail, processRevenueShareBilling } from '../processRevenueShareBilling'

const prismaMock = prisma as any
const storeMock = resolveShopifyStoreForUser as jest.Mock
const usageMock = recordShopifyUsage as jest.Mock
const emailMock = sendEmail as jest.Mock

const periodStart = new Date('2026-09-01T00:00:00Z')
const periodEnd = new Date('2026-10-01T00:00:00Z')

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    provider: 'shopify',
    plan: 'growth',
    status: 'active',
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    overageMessages: 0,
    bargainOverageDeals: 0,
    cartOverage: 0,
    shopifyLineItemId: 'line-1',
    user: { id: 'user-1', email: 'merchant@example.com', name: 'Merchant' },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  storeMock.mockResolvedValue({ id: 'store-1', domain: 'shop.myshopify.com', currency: 'INR' })
  prismaMock.subscription.findMany.mockResolvedValue([subscription()])
  prismaMock.invoice.findFirst.mockResolvedValue(null)
  prismaMock.revenueShareEvent.findMany.mockResolvedValue([{ revShareAmount: 200 }])
  prismaMock.bargainRevenueShareEvent.findMany.mockResolvedValue([])
  prismaMock.invoice.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'inv-1', ...data }))
  prismaMock.invoice.update.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
  prismaMock.$transaction.mockResolvedValue([])
  usageMock.mockResolvedValue({ ok: true, usageRecordId: 'usage-1' })
})

describe('processRevenueShareBilling', () => {
  it('never charges a legacy non-Shopify subscription off-platform', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([subscription({ provider: 'razorpay' })])

    const result = await processRevenueShareBilling()

    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(0)
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(usageMock).not.toHaveBeenCalled()
  })

  it('settles through Shopify usage and marks the ledger invoice paid', async () => {
    const result = await processRevenueShareBilling()

    expect(result.processed).toBe(1)
    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lineItemId: 'line-1',
        amount: 200,
        currency: 'INR',
        idempotencyKey: 'cartgain-invoice-inv-1',
      }),
    )
    expect(prismaMock.$transaction).toHaveBeenCalled()
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: expect.objectContaining({ status: 'paid', paidVia: 'shopify', paymentRef: 'usage-1' }),
    })
    expect(emailMock).toHaveBeenCalled()
  })

  it('keeps the pending invoice so a retry can never double-charge', async () => {
    usageMock.mockResolvedValue({ ok: false, error: 'boom' })

    const result = await processRevenueShareBilling()

    expect(result.processed).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(prismaMock.invoice.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    )
    expect(prismaMock.revenueShareEvent.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.bargainRevenueShareEvent.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.subscription.update).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('resumes a pending invoice with the same idempotency key instead of creating a new one', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-pending',
      amount: 200,
      status: 'pending',
      periodEnd,
    })

    const result = await processRevenueShareBilling()

    expect(result.processed).toBe(1)
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'cartgain-invoice-inv-pending' }),
    )
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-pending' },
      data: expect.objectContaining({ status: 'paid' }),
    })
  })

  it('applies the USD usage cap instead of the INR plan cap', async () => {
    storeMock.mockResolvedValue({ id: 'store-1', domain: 'shop.myshopify.com', currency: 'USD' })
    prismaMock.revenueShareEvent.findMany.mockResolvedValue([{ revShareAmount: 5000 }])

    await processRevenueShareBilling()

    expect(usageMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 60, currency: 'USD' }))
  })
})

describe('buildRevenueShareInvoiceEmail', () => {
  it('renders a Shopify receipt with no off-platform payment link', () => {
    const html = buildRevenueShareInvoiceEmail({
      userName: 'Merchant',
      invoiceAmount: 19.5,
      currency: 'USD',
      periodStart,
      periodEnd,
      dueDate: periodEnd,
      eventCount: 2,
    })

    expect(html).toContain('Shopify billing account')
    expect(html).toContain('$19.50')
    expect(html).not.toContain('Pay Now')
    expect(html).not.toContain('paymentLink')
  })
})
