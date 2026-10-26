/**
 * Cart overage: once a paid merchant passes their plan's cart allowance we must
 * keep recovering — and record each extra cart on `cartOverage` so the billing
 * sweep can meter it. Free plans still hard-stop at the threshold.
 */
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import prisma from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    campaign: { findMany: jest.fn() },
    optOut: { findMany: jest.fn() },
    subscription: { findFirst: jest.fn(), update: jest.fn() },
    aBTest: { findFirst: jest.fn() },
    customerIdentity: {
      findMany: jest.fn(async ({ where }: any) =>
        (where?.OR || [])
          .filter((o: any) => o.phone)
          .map((o: any) => ({
            id: `recipient-${o.phone}`,
            phone: o.phone,
            email: null,
            shopifyCustomerId: null,
            name: 'Buyer',
            consentWhatsApp: true,
            consentEmail: true,
            consentSms: false,
            suppressed: false,
            optedOutAt: null,
            lastSeenAt: new Date(),
            createdAt: new Date(),
          })),
      ),
      create: jest.fn(async ({ data }: any) => ({ id: 'recipient-1', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      findUnique: jest.fn(async () => null),
    },
    cart: { findMany: jest.fn() },
    message: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(async () => ({ id: 'message-1' })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    analytics: { upsert: jest.fn(async () => ({})) },
  },
}))

jest.mock('@/lib/redis', () => ({
  getRedis: jest.fn(() => null),
  redisSetNX: jest.fn(async () => true),
  redisIncr: jest.fn(async () => 1),
  redisGet: jest.fn(async () => null),
  redisExpire: jest.fn(async () => true),
}))

jest.mock('@/lib/job-lock', () => ({ releaseLock: jest.fn(async () => {}) }))

const getPlanMock = jest.fn()
jest.mock('@/lib/payment', () => ({
  FREE_CARTS_THRESHOLD: 50,
  PLANS: { FREE: { maxMessagesPerCustomer: { email: 3, whatsapp: 2 } } },
  PAID_PLAN_IDS: ['growth'],
  resolvePlanId: jest.fn((p: string) => p),
  getPlan: (p: string) => getPlanMock(p),
}))

jest.mock('@/lib/services/email', () => ({
  sendEmail: jest.fn(async () => ({ success: true })),
  EmailTemplates: { abandoned: jest.fn(() => '<div></div>') },
}))

jest.mock('@/lib/services/whatsapp', () => {
  const template = () => ({ name: 'tpl', generateParams: jest.fn(() => ['p']) })
  return {
    sendWhatsAppMessage: jest.fn(async () => ({ success: true })),
    WhatsAppTemplates: {
      abandoned_cart: template(),
      abandoned_cart_followup: template(),
      abandoned_cart_urgent: template(),
    },
  }
})

jest.mock('@/lib/services/ai', () => ({
  generatePersonalizedDiscount: jest.fn(),
}))

jest.mock('@/lib/data-protection', () => ({ logDataAccess: jest.fn(async () => {}) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/opt-out', () => ({ buildOptOutUrl: jest.fn(() => 'https://example.test/optout') }))

const prismaMock = prisma as any
const whatsappMock = sendWhatsAppMessage as jest.Mock

function baseCampaign(over: Record<string, any> = {}) {
  return {
    id: 'camp-1',
    userId: 'user-1',
    channels: ['whatsapp'],
    sendDelay: 0,
    followUpDelay: 0,
    maxFollowUps: 0,
    store: { id: 'store-1', currency: 'INR', timezone: 'UTC', name: 'Test Store', domain: 'test.myshopify.com' },
    ...over,
  }
}

function cart(over: Record<string, any> = {}) {
  return {
    id: 'cart-1',
    cartId: null,
    customerEmail: null,
    customerPhone: '+91 99999 99999',
    customerName: 'Buyer',
    items: [{ name: 'Thing', price: 100, quantity: 1 }],
    totalValue: 100,
    abandonedAt: new Date(Date.now() - 60 * 60 * 1000),
    messages: [],
    isRecovered: false,
    convertedAt: null,
    ...over,
  }
}

function paidSubscription(over: Record<string, any> = {}) {
  return {
    id: 'sub-1',
    plan: 'growth',
    status: 'active',
    currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
    overageMessages: 0,
    cartOverage: 0,
    cartsUsedInPeriod: 0,
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
  process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
  getPlanMock.mockReturnValue({ maxCarts: 750, maxMessagesPerCustomer: { email: 3, whatsapp: 2 } })
  prismaMock.optOut.findMany.mockResolvedValue([])
  prismaMock.aBTest.findFirst.mockResolvedValue(null)
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.groupBy.mockResolvedValue([])
  prismaMock.message.create.mockResolvedValue({})
  prismaMock.analytics.upsert.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
})

describe('processAbandonedCarts — cart overage', () => {
  it('keeps sending and records cartOverage when a paid store is over its cart quota', async () => {
    getPlanMock.mockReturnValue({ maxCarts: 0, maxMessagesPerCustomer: { email: 3, whatsapp: 2 } })
    prismaMock.subscription.findFirst.mockResolvedValue(paidSubscription())
    prismaMock.campaign.findMany.mockResolvedValue([baseCampaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    // Not hard-stopped: the recovery message is still sent.
    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledTimes(1)
    // ...and the extra cart is metered for the invoice.
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { cartOverage: { increment: 1 } },
    })
  })

  it('does not meter cart overage while the paid store is within quota', async () => {
    getPlanMock.mockReturnValue({ maxCarts: 750, maxMessagesPerCustomer: { email: 3, whatsapp: 2 } })
    prismaMock.subscription.findFirst.mockResolvedValue(paidSubscription())
    prismaMock.campaign.findMany.mockResolvedValue([baseCampaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    const cartOverageCalls = prismaMock.subscription.update.mock.calls.filter(
      (c: any[]) => c[0]?.data?.cartOverage
    )
    expect(cartOverageCalls).toHaveLength(0)
  })

  it('still hard-stops a free store once the free threshold is exhausted', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue(null)
    prismaMock.message.groupBy.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ cartId: `old-${i}` }))
    )
    prismaMock.campaign.findMany.mockResolvedValue([baseCampaign()])
    prismaMock.cart.findMany.mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(0)
    expect(whatsappMock).not.toHaveBeenCalled()
  })
})
