/**
 * @jest-environment node
 *
 * The recovery engine must never infer WhatsApp consent. These tests pin the
 * send-time gate: an explicit, phone-matched opt-in is required, a recorded
 * unsubscribe stops every channel, a converted cart is never messaged, and a
 * failed send is retried with exponential backoff instead of every sweep.
 */
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import prisma from '@/lib/db'
import { sendEmail } from '@/lib/services/email'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    campaign: { findMany: jest.fn() },
    optOut: { findMany: jest.fn() },
    subscription: { findFirst: jest.fn(), update: jest.fn() },
    aBTest: { findFirst: jest.fn() },
    customerIdentity: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'recipient-new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      findUnique: jest.fn(async () => null),
    },
    cart: { findMany: jest.fn(), update: jest.fn(async () => ({})) },
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
  redisSet: jest.fn(async () => undefined),
  redisExpire: jest.fn(async () => true),
}))

jest.mock('@/lib/job-lock', () => ({ releaseLock: jest.fn(async () => {}) }))

jest.mock('@/lib/payment', () => ({
  FREE_CARTS_THRESHOLD: 50,
  PLANS: { FREE: { maxMessagesPerCustomer: { email: Infinity, whatsapp: Infinity } } },
  PAID_PLAN_IDS: [],
  resolvePlanId: jest.fn((p: string) => p),
  getPlan: jest.fn(() => ({ maxCarts: Infinity })),
}))

jest.mock('@/lib/services/email', () => ({
  sendEmail: jest.fn(async () => ({ success: true, messageId: 'email-1' })),
  EmailTemplates: { abandoned: jest.fn(() => '<div></div>') },
}))

jest.mock('@/lib/services/whatsapp', () => {
  const template = () => ({ name: 'tpl', generateParams: jest.fn(() => ['p']) })
  return {
    sendWhatsAppMessage: jest.fn(async () => ({ success: true, messageId: 'wamid.1' })),
    WhatsAppTemplates: {
      abandoned_cart: template(),
      abandoned_cart_followup: template(),
      abandoned_cart_urgent: template(),
    },
  }
})

jest.mock('@/lib/services/ai', () => ({ generatePersonalizedDiscount: jest.fn() }))
jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(async () => {}),
  redactSensitive: jest.fn((s: string) => s),
}))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/opt-out', () => ({ buildOptOutUrl: jest.fn(() => 'https://x/optout') }))

const prismaMock = prisma as any
const emailMock = sendEmail as jest.Mock
const whatsappMock = sendWhatsAppMessage as jest.Mock

const HOUR = 60 * 60 * 1000
const PHONE = '+919999999999'

function campaign() {
  return {
    id: 'camp-1',
    userId: 'user-1',
    isActive: true,
    channels: ['whatsapp', 'email'],
    sendDelay: 0,
    followUpDelay: 180,
    maxFollowUps: 2,
    discountEnabled: false,
    aiOptimized: false,
    store: {
      id: 'store-1',
      currency: 'INR',
      timezone: 'UTC',
      name: 'Test Store',
      domain: 'test.myshopify.com',
    },
  }
}

function cart(over: Record<string, any> = {}) {
  return {
    id: 'cart-1',
    cartId: null,
    customerEmail: 'buyer@example.com',
    customerPhone: PHONE,
    customerName: 'Buyer',
    items: [{ name: 'Thing', price: 100, quantity: 1 }],
    totalValue: 100,
    abandonedAt: new Date(Date.now() - 3 * HOUR),
    messages: [],
    isRecovered: false,
    convertedAt: null,
    ...over,
  }
}

function identity(over: Record<string, any> = {}) {
  return {
    id: 'recipient-1',
    storeId: 'store-1',
    phone: PHONE,
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
    ...over,
  }
}

function prime(over: Record<string, any> = {}) {
  prismaMock.campaign.findMany.mockResolvedValue([campaign()])
  prismaMock.cart.findMany.mockResolvedValueOnce([cart(over)]).mockResolvedValue([])
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
  process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
  delete process.env.RECOVERY_MAX_SEND_ATTEMPTS
  delete process.env.RECOVERY_RETRY_BASE_MS
  prismaMock.subscription.findFirst.mockResolvedValue(null)
  prismaMock.aBTest.findFirst.mockResolvedValue(null)
  prismaMock.optOut.findMany.mockResolvedValue([])
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.groupBy.mockResolvedValue([])
  prismaMock.message.create.mockResolvedValue({ id: 'message-1' })
  prismaMock.message.update.mockResolvedValue({})
  prismaMock.analytics.upsert.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
  prismaMock.customerIdentity.findMany.mockResolvedValue([])
  prismaMock.customerIdentity.create.mockImplementation(async ({ data }: any) => ({
    id: 'recipient-new',
    ...data,
  }))
})

describe('recovery send-time consent gate', () => {
  it('sends email but never WhatsApp without an explicit opt-in', async () => {
    prime()
    prismaMock.customerIdentity.create.mockResolvedValue(
      identity({ id: 'recipient-new', consentWhatsApp: false, consentEmail: false }),
    )

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(result.messagesSent).toBe(1)
  })

  it('sends WhatsApp only when the matching identity opted in', async () => {
    prime()
    prismaMock.customerIdentity.findMany.mockResolvedValue([identity()])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(result.messagesSent).toBe(2)
  })

  it('does not accept consent recorded against a different phone', async () => {
    prime()
    // Mirror Prisma's OR filter: a row for another phone must not be matched.
    prismaMock.customerIdentity.findMany.mockImplementation(async ({ where }: any) => {
      const rows = [identity({ phone: '+918888888888' })]
      const ors = where?.OR || []
      return rows.filter((row: any) =>
        ors.some(
          (o: any) =>
            (o.phone && o.phone === row.phone) ||
            (o.email && o.email === row.email) ||
            (o.shopifyCustomerId && o.shopifyCustomerId === row.shopifyCustomerId),
        ),
      )
    })

    await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
  })

  it('stops every channel for a suppressed identity', async () => {
    prime()
    prismaMock.customerIdentity.findMany.mockResolvedValue([
      identity({ suppressed: true }),
    ])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
  })

  it('never messages a cart that converted between the query and the send', async () => {
    prime({ convertedAt: new Date() })

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
  })

  it('does not send WhatsApp when the provider is not configured, but still emails', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    delete process.env.WHATSAPP_BUSINESS_TOKEN
    prime()
    prismaMock.customerIdentity.findMany.mockResolvedValue([identity()])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(result.messagesSent).toBe(1)
  })

  it('backs off a recent failed attempt instead of retrying on every sweep', async () => {
    prime({
      messages: [
        {
          id: 'failed-email',
          channel: 'email',
          step: 0,
          status: 'failed',
          attempts: 2,
          lastAttemptAt: new Date(),
          createdAt: new Date(),
        },
      ],
    })
    prismaMock.customerIdentity.findMany.mockResolvedValue([identity()])

    await processAbandonedCarts(25)

    expect(emailMock).not.toHaveBeenCalled()
    expect(whatsappMock).toHaveBeenCalledTimes(1)
  })

  it('retries after the backoff window has elapsed', async () => {
    prime({
      messages: [
        {
          id: 'failed-email',
          channel: 'email',
          step: 0,
          status: 'failed',
          attempts: 1,
          lastAttemptAt: new Date(Date.now() - 30 * 60 * 1000),
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      ],
    })
    prismaMock.customerIdentity.findMany.mockResolvedValue([identity()])

    await processAbandonedCarts(25)

    expect(emailMock).toHaveBeenCalledTimes(1)
  })

  it('marks a spent retry budget as skipped with an explainable reason', async () => {
    process.env.RECOVERY_MAX_SEND_ATTEMPTS = '3'
    prime({
      messages: [
        {
          id: 'failed-email',
          channel: 'email',
          step: 0,
          status: 'failed',
          attempts: 3,
          lastAttemptAt: new Date(),
          createdAt: new Date(),
        },
      ],
    })
    prismaMock.customerIdentity.findMany.mockResolvedValue([identity()])

    await processAbandonedCarts(25)

    expect(emailMock).not.toHaveBeenCalled()
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'failed-email' },
      data: { status: 'skipped', reasonCode: 'retry_exhausted' },
    })
  })
})
