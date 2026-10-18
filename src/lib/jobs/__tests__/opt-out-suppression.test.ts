/**
 * @jest-environment node
 *
 * Regression test for the channel-agnostic opt-out gate in the recovery job.
 *
 * Fault: processSingleCart only consulted the phone opt-out set when the cart
 * had NO email (`if (customerPhone && !customerEmail && ...)`). A shopper who
 * unsubscribed via WhatsApp but whose cart ALSO carried an email was therefore
 * never suppressed — the job happily sent to their opted-out number.
 *
 * Fix: the phone check is channel-agnostic, matching the email check and the
 * shared isContactOptedOut() semantics (opt out on either contact => suppress).
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
    cart: { findMany: jest.fn() },
    message: { findMany: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
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
  EmailTemplates: {},
}))

jest.mock('@/lib/services/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn(async () => ({ success: true })),
  WhatsAppTemplates: {},
}))

jest.mock('@/lib/services/ai', () => ({
  generateEmailContent: jest.fn(),
  generateWhatsAppContent: jest.fn(),
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

const campaign = {
  id: 'camp-1',
  userId: 'user-1',
  isActive: true,
  channels: ['whatsapp', 'email'],
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
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.campaign.findMany.mockResolvedValue([campaign])
  prismaMock.subscription.findFirst.mockResolvedValue(null)
  prismaMock.aBTest.findFirst.mockResolvedValue(null)
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.groupBy.mockResolvedValue([])
  prismaMock.message.create.mockResolvedValue({})
  prismaMock.subscription.update.mockResolvedValue({})
})

describe('processAbandonedCarts — opt-out is channel-agnostic', () => {
  it('suppresses a cart whose PHONE opted out even though it also has an email', async () => {
    // Phone opted out; email is NOT opted out.
    prismaMock.optOut.findMany.mockResolvedValue([
      { id: 'o1', email: null, phone: '919999999999' },
    ])
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        {
          id: 'cart-1',
          cartId: null, // no bargain session -> skip the hook
          customerEmail: 'buyer@example.com',
          customerPhone: '+91 99999 99999',
          customerName: 'Buyer',
          items: [{ name: 'Thing', price: 100, quantity: 1 }],
          totalValue: 100,
          abandonedAt: new Date(Date.now() - 60 * 60 * 1000),
          messages: [],
          isRecovered: false,
          convertedAt: null,
        },
      ])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.messagesSent).toBe(0)
    expect(emailMock).not.toHaveBeenCalled()
    expect(whatsappMock).not.toHaveBeenCalled()
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })
})
