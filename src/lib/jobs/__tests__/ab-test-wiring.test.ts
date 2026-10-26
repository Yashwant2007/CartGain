/**
 * @jest-environment node
 *
 * Regression test for A/B test wiring in the recovery job.
 *
 * Fault: processSingleCart computed the A/B variant's channels/delays/maxFollowUps
 * into `adj*` locals that were never read — only the `[AB:x]` tag on the stored
 * message record reflected the variant. An A/B test therefore changed nothing
 * about what was actually sent.
 *
 * Fix: the variant is resolved before any send decision and its effective values
 * drive the step guard, delay guard and channel rotation.
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

jest.mock('@/lib/payment', () => ({
  FREE_CARTS_THRESHOLD: 50,
  PLANS: { FREE: { maxMessagesPerCustomer: { email: Infinity, whatsapp: Infinity } } },
  PAID_PLAN_IDS: [],
  resolvePlanId: jest.fn((p: string) => p),
  getPlan: jest.fn(() => ({ maxCarts: Infinity })),
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

jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(async () => {}),
  redactSensitive: jest.fn((s: string) => s),
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/opt-out', () => ({ buildOptOutUrl: jest.fn(() => 'https://x/optout') }))

const prismaMock = prisma as any
const emailMock = sendEmail as jest.Mock
const whatsappMock = sendWhatsAppMessage as jest.Mock

function baseCampaign(over: Record<string, any> = {}) {
  return {
    id: 'camp-1',
    userId: 'user-1',
    isActive: true,
    channels: ['whatsapp'],
    sendDelay: 0,
    followUpDelay: 0,
    maxFollowUps: 0,
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

beforeEach(() => {
  jest.clearAllMocks()
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
  process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
  prismaMock.subscription.findFirst.mockResolvedValue(null)
  prismaMock.aBTest.findFirst.mockResolvedValue(null)
  prismaMock.optOut.findMany.mockResolvedValue([])
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.groupBy.mockResolvedValue([])
  prismaMock.message.create.mockResolvedValue({})
  prismaMock.analytics.upsert.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
})

describe('processAbandonedCarts — A/B variant config is applied', () => {
  it('control: without an A/B test the cart sends on the campaign channel', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([baseCampaign()])
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledTimes(1)
  })

  it('applies the variant channels: variant pointing at an unreachable channel sends nothing', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([baseCampaign()])
    prismaMock.aBTest.findFirst.mockResolvedValue({
      id: 'ab-1',
      variantA: { channels: ['email'] },
      variantB: { channels: ['email'] },
    })
    // Cart has a phone but NO email, so the variant's ['email'] channel is
    // unreachable — the correct outcome is "do not send" (was: sent WhatsApp).
    prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(0)
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('applies the variant maxFollowUps: a follow-up blocked by the variant sends nothing', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      baseCampaign({ channels: ['whatsapp', 'email'], maxFollowUps: 2 }),
    ])
    prismaMock.aBTest.findFirst.mockResolvedValue({
      id: 'ab-2',
      variantA: { maxFollowUps: 1 },
      variantB: { maxFollowUps: 1 },
    })
    // Round 0 is complete (both channels accepted a message), so this is
    // round 1. The variant allows only one round, so the follow-up must be
    // skipped; the campaign budget (two rounds) would have allowed it.
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({
          customerEmail: 'buyer@example.com',
          messages: [
            { channel: 'whatsapp', status: 'sent', step: 0 },
            { channel: 'email', status: 'sent', step: 0 },
          ],
        }),
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(0)
    expect(emailMock).not.toHaveBeenCalled()
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })
})
