/**
 * @jest-environment node
 *
 * The recovery sweep is strictly sequential: one channel per sweep, in the
 * merchant's configured order. A round is a full pass over the configured
 * channels, so channels=[whatsapp,email] with maxFollowUps=2 schedules
 * whatsapp(r0) → email(r0) → whatsapp(r1) → email(r1), each separated by the
 * follow-up delay (floored at 30 minutes). Email and WhatsApp must never fire
 * in the same sweep.
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

function campaign(over: Record<string, any> = {}) {
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
    ...over,
  }
}

function cart(over: Record<string, any> = {}) {
  return {
    id: 'cart-1',
    cartId: null,
    customerEmail: 'buyer@example.com',
    customerPhone: '+91 99999 99999',
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

beforeEach(() => {
  jest.clearAllMocks()
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
  process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
  prismaMock.subscription.findFirst.mockResolvedValue(null)
  prismaMock.aBTest.findFirst.mockResolvedValue(null)
  prismaMock.optOut.findMany.mockResolvedValue([])
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.groupBy.mockResolvedValue([])
  prismaMock.message.create.mockResolvedValue({ id: 'message-1' })
  prismaMock.analytics.upsert.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
})

describe('recovery sequence — one channel per sweep', () => {
  it('sends only the first configured channel on the first sweep', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
    const created = prismaMock.message.create.mock.calls[0][0].data
    expect(created).toMatchObject({ channel: 'whatsapp', step: 0 })
  })

  it('never sends two channels in the same sweep', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
  })

  it('sends the next configured channel on a later sweep once the first step completed', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          messages: [{ channel: 'whatsapp', status: 'sent', step: 0 }],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).toHaveBeenCalledTimes(1)
    const created = prismaMock.message.create.mock.calls[0][0].data
    expect(created).toMatchObject({ channel: 'email', step: 1 })
  })

  it('holds the next step until its scheduled follow-up delay has elapsed', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          abandonedAt: new Date(Date.now() - 30 * 60 * 1000),
          messages: [{ channel: 'whatsapp', status: 'sent', step: 0 }],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(0)
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('retries only the current failed step, not the next channel', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          messages: [{ channel: 'whatsapp', status: 'failed', step: 0, attempts: 0 }],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('advances to the follow-up round after the scheduled interval', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          abandonedAt: new Date(Date.now() - 7 * HOUR),
          messages: [
            { channel: 'whatsapp', status: 'sent', step: 0 },
            { channel: 'email', status: 'delivered', step: 1 },
          ],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
    const created = prismaMock.message.create.mock.calls[0][0].data
    expect(created).toMatchObject({ channel: 'whatsapp', step: 2 })
  })

  it('stops after maxFollowUps rounds', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ maxFollowUps: 1 })])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          messages: [
            { channel: 'whatsapp', status: 'sent', step: 0 },
            { channel: 'email', status: 'sent', step: 1 },
          ],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)
    expect(result.messagesSent).toBe(0)
  })

  it('stops the sequence once the customer replies', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])
    prismaMock.customerIdentity.findMany.mockResolvedValueOnce([
      {
        id: 'recipient-replied',
        phone: '+919999999999',
        email: 'buyer@example.com',
        shopifyCustomerId: null,
        name: 'Buyer',
        consentWhatsApp: true,
        consentEmail: true,
        consentSms: false,
        suppressed: false,
        optedOutAt: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
        whatsappConsentAt: new Date(Date.now() - 2 * HOUR),
        lastInboundAt: new Date(Date.now() - HOUR),
      },
    ])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(0)
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('does not treat an inbound START as a reply and still sends', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])
    const consentAt = new Date(Date.now() - HOUR)
    prismaMock.customerIdentity.findMany.mockResolvedValueOnce([
      {
        id: 'recipient-started',
        phone: '+919999999999',
        email: 'buyer@example.com',
        shopifyCustomerId: null,
        name: 'Buyer',
        consentWhatsApp: true,
        consentEmail: true,
        consentSms: false,
        suppressed: false,
        optedOutAt: null,
        lastSeenAt: consentAt,
        createdAt: consentAt,
        whatsappConsentAt: consentAt,
        lastInboundAt: consentAt,
      },
    ])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledTimes(1)
  })
})
