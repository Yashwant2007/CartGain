/**
 * @jest-environment node
 *
 * WhatsApp is not always deliverable: the number may not exist on WhatsApp,
 * the approved template may not match, or the Meta credential may be broken.
 * The recovery job used to mark the WhatsApp row failed and move on, so a
 * campaign that enabled both channels still reached the shopper by email only
 * in a later round — and a WhatsApp-only campaign reached nobody.
 *
 * Expected behaviour now: a failed WhatsApp send that email can cover sends
 * the email in the SAME round. A permanently undeliverable channel is marked
 * `skipped` so the sequence can advance; a credential problem stays `failed`
 * so it is retried after Meta is fixed. Transient failures never fall back.
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

function statusUpdates() {
  return prismaMock.message.update.mock.calls.map((c: any) => c[0].data.status)
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
  prismaMock.message.update.mockResolvedValue({})
  prismaMock.analytics.upsert.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
  prismaMock.cart.update.mockResolvedValue({})
})

describe('WhatsApp → email fallback', () => {
  it('sends the email in the same round when WhatsApp cannot deliver the number', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Message undeliverable',
      errorCode: 131026,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(result.messagesSent).toBe(1)
    const steps = prismaMock.message.create.mock.calls.map((c: any) => c[0].data.step)
    expect(steps).toEqual([0, 0])
    expect(statusUpdates()).toContain('skipped')
  })

  it('falls back on a broken Meta credential but keeps WhatsApp retryable', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Invalid parameter',
      errorCode: 100,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(result.messagesSent).toBe(1)
    expect(statusUpdates()).not.toContain('skipped')
    expect(statusUpdates()).toContain('failed')
  })

  it('still emails a shopper whose number cannot receive WhatsApp (WhatsApp-only campaign)', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Message undeliverable',
      errorCode: 131026,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(statusUpdates()).toContain('skipped')
  })

  it('does not fall back on a transient failure', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Temporarily unavailable',
      errorCode: 131000,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(emailMock).not.toHaveBeenCalled()
    expect(statusUpdates()).not.toContain('skipped')
    expect(statusUpdates()).toContain('failed')
  })

  it('does not duplicate an email that already went out this round', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Message undeliverable',
      errorCode: 131026,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({ messages: [{ channel: 'email', status: 'sent', step: 0 }] }),
      ])
      .mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(emailMock).not.toHaveBeenCalled()
    expect(statusUpdates()).toContain('skipped')
  })
})
