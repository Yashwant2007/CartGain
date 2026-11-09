/**
 * @jest-environment node
 *
 * WhatsApp is not always deliverable: the number may not exist on WhatsApp,
 * the approved template may not match, or the Meta credential may be broken.
 *
 * Under the sequential engine the sender never fires email from inside a
 * WhatsApp attempt. A failure is classified and the *current* step either stays
 * retryable (`failed`) or is terminally marked `skipped`. The configured email
 * step is only sent on a later sweep, when its own schedule is due. A
 * WhatsApp-only campaign therefore never silently emails.
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

describe('WhatsApp failures — sequential handoff to email', () => {
  it('marks a permanent WhatsApp failure skipped without emailing in the same sweep', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Message undeliverable',
      errorCode: 131026,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
    expect(statusUpdates()).toContain('skipped')
  })

  it('sends the configured email step on a later sweep after WhatsApp was skipped', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          messages: [
            {
              id: 'wa-1',
              channel: 'whatsapp',
              step: 0,
              status: 'skipped',
              reasonCode: 'whatsapp_permanent',
            },
          ],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(emailMock).toHaveBeenCalledTimes(1)
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(1)
    const created = prismaMock.message.create.mock.calls[0][0].data
    expect(created).toMatchObject({ channel: 'email', step: 1 })
  })

  it('keeps a broken Meta credential retryable and does not email in the same sweep', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Invalid parameter',
      errorCode: 100,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
    expect(statusUpdates()).not.toContain('skipped')
    expect(statusUpdates()).toContain('failed')
  })

  it('never emails a WhatsApp-only campaign when WhatsApp fails', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Message undeliverable',
      errorCode: 131026,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
    expect(statusUpdates()).toContain('skipped')
  })

  it('does not hand off on a transient failure', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'Temporarily unavailable',
      errorCode: 131000,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(emailMock).not.toHaveBeenCalled()
    expect(statusUpdates()).not.toContain('skipped')
    expect(statusUpdates()).toContain('failed')
  })

  it('records an engagement-limited WhatsApp attempt as failed and retryable', async () => {
    whatsappMock.mockResolvedValue({
      success: false,
      error: 'This message was not delivered to maintain healthy ecosystem engagement.',
      errorCode: 131049,
    })
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
    expect(statusUpdates()).not.toContain('skipped')
    expect(statusUpdates()).toContain('failed')
    const failed = prismaMock.message.update.mock.calls.find(
      (c: any) => c[0].data.status === 'failed',
    )?.[0]
    expect(failed?.data.reasonCode).toBe('whatsapp_engagement_limited')
  })

  it('does not retry a recent engagement-limited delivery receipt', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          messages: [
            {
              id: 'wa-1',
              channel: 'whatsapp',
              step: 0,
              status: 'failed',
              attempts: 1,
              reasonCode:
                'provider_failed:131049:This message was not delivered to maintain healthy ecosystem engagement.',
              lastAttemptAt: new Date(),
              createdAt: new Date(),
            },
          ],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
    expect(result.messagesSent).toBe(0)
    expect(statusUpdates()).not.toContain('skipped')
  })

  it('skips an engagement-limited WhatsApp step after two attempts', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp', 'email'] })])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          messages: [
            {
              id: 'wa-1',
              channel: 'whatsapp',
              step: 0,
              status: 'failed',
              attempts: 2,
              reasonCode:
                'provider_failed:131049:This message was not delivered to maintain healthy ecosystem engagement.',
              lastAttemptAt: new Date(Date.now() - 24 * HOUR),
              createdAt: new Date(Date.now() - 25 * HOUR),
            },
          ],
        }),
      ])
      .mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
    expect(statusUpdates()).toContain('skipped')
    const skipped = prismaMock.message.update.mock.calls.find(
      (c: any) => c[0].data.status === 'skipped',
    )?.[0]
    expect(skipped?.data.reasonCode).toBe('whatsapp_engagement_limited')
  })

  it('sends free-form text when the shopper messaged in the last 24h', async () => {
    prismaMock.customerIdentity.findMany.mockResolvedValueOnce([
      {
        id: 'recipient-1',
        storeId: 'store-1',
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
        // The 24h window was opened by the inbound START opt-in itself, not a
        // later reply, so the automated sequence may still send.
        lastInboundAt: new Date(Date.now() - HOUR),
        whatsappConsentAt: new Date(Date.now() - HOUR),
        createdAt: new Date(),
      },
    ])
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    const payload = whatsappMock.mock.calls[0][0]
    expect(payload.templateName).toBeUndefined()
    expect(typeof payload.content).toBe('string')
    expect(payload.content.length).toBeGreaterThan(0)
    const persisted = prismaMock.message.update.mock.calls.find(
      (c: any) => c[0].data.content,
    )?.[0]
    expect(persisted?.data.content).toBe(payload.content)
  })

  it('uses the approved template once the 24h window has closed', async () => {
    prismaMock.customerIdentity.findMany.mockResolvedValueOnce([
      {
        id: 'recipient-1',
        storeId: 'store-1',
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
        lastInboundAt: new Date(Date.now() - 25 * HOUR),
        createdAt: new Date(),
      },
    ])
    prismaMock.campaign.findMany.mockResolvedValue([campaign({ channels: ['whatsapp'] })])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(whatsappMock).toHaveBeenCalledTimes(1)
    const payload = whatsappMock.mock.calls[0][0]
    expect(payload.templateName).toBe('tpl')
    expect(payload.content).toBeUndefined()
  })
})
