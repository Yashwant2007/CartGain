/**
 * Recovery message wiring: the ACTUAL WhatsApp template params and email
 * options produced by the job. Guards the "offer is real, links are right"
 * contract:
 *   - every template body variable is non-empty;
 *   - the offer code in the copy is the merchant-authorised one;
 *   - the checkout link carries the code, the bargain link opens the widget;
 *   - no offer line is invented when the merchant disabled discounts.
 */
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    campaign: { findMany: jest.fn() },
    optOut: { findMany: jest.fn() },
    subscription: { findFirst: jest.fn(), update: jest.fn() },
    aBTest: { findFirst: jest.fn() },
    cart: { findMany: jest.fn() },
    message: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(async () => ({ id: 'message-1' })),
      update: jest.fn(async () => ({})),
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
  PLANS: { FREE: { maxMessagesPerCustomer: { email: 3, whatsapp: 2 } } },
  PAID_PLAN_IDS: ['growth'],
  resolvePlanId: jest.fn((p: string) => p),
  getPlan: () => ({ maxCarts: 750, maxMessagesPerCustomer: { email: 3, whatsapp: 2 } }),
}))

const sendEmailMock = jest.fn(async (..._args: any[]) => ({ success: true, messageId: 'em_1' }))
const abandonedTemplateMock = jest.fn((..._args: any[]) => '<div></div>')
jest.mock('@/lib/services/email', () => ({
  sendEmail: (...args: any[]) => sendEmailMock(...args),
  EmailTemplates: { abandoned: (...args: any[]) => abandonedTemplateMock(...args) },
}))

const sendWhatsAppMock = jest.fn(async (..._args: any[]) => ({ success: true, messageId: 'wa_1' }))
jest.mock('@/lib/services/whatsapp', () => {
  const actual = jest.requireActual('@/lib/services/whatsapp')
  return { ...actual, sendWhatsAppMessage: (...args: any[]) => sendWhatsAppMock(...args) }
})

jest.mock('@/lib/services/ai', () => ({ generatePersonalizedDiscount: jest.fn() }))
jest.mock('@/lib/data-protection', () => ({ logDataAccess: jest.fn(async () => {}) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/opt-out', () => ({ buildOptOutUrl: jest.fn(() => 'https://example.test/optout') }))

const prismaMock = prisma as any

function campaign(over: Record<string, any> = {}) {
  return {
    id: 'camp-1',
    userId: 'user-1',
    channels: ['whatsapp'],
    sendDelay: 0,
    followUpDelay: 0,
    maxFollowUps: 0,
    discountEnabled: false,
    store: { id: 'store-1', currency: 'INR', timezone: 'UTC', name: 'Acme', domain: 'acme.myshopify.com' },
    ...over,
  }
}

function cart(over: Record<string, any> = {}) {
  return {
    id: 'cart-1',
    cartId: 'shopify_cart_1',
    customerEmail: null,
    customerPhone: '+91 99999 99999',
    customerName: 'Priya',
    items: [{ name: 'Sneaker', price: 100, quantity: 1 }],
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
  process.env.NEXT_PUBLIC_APP_URL = 'https://cart-gain.com'
  prismaMock.optOut.findMany.mockResolvedValue([])
  prismaMock.aBTest.findFirst.mockResolvedValue(null)
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.groupBy.mockResolvedValue([])
  prismaMock.campaign.findMany.mockResolvedValue([campaign()])
  prismaMock.cart.findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([])
})

const lastWhatsAppParams = () => {
  const args = sendWhatsAppMock.mock.calls.at(-1)?.[0] as any
  return args?.templateParams
}

describe('recovery message wiring', () => {
  it('sends a WhatsApp template whose body variables are all filled', async () => {
    await processAbandonedCarts(25)

    expect(sendWhatsAppMock).toHaveBeenCalledTimes(1)
    const args = sendWhatsAppMock.mock.calls[0][0] as any
    expect(args.templateName).toBeTruthy()
    expect(args.templateParams.body).toHaveLength(3)
    for (const value of args.templateParams.body) {
      expect(String(value).trim().length).toBeGreaterThan(0)
    }
  })

  it('uses the merchant code and both working links when discounts are on', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      campaign({ discountEnabled: true, discountType: 'percentage', discountValue: 15, discountCode: 'SAVE15' }),
    ])

    await processAbandonedCarts(25)

    const body: string[] = lastWhatsAppParams().body
    expect(body[2]).toContain('SAVE15')
    expect(body[2]).toContain('15% off')
    expect(body[2]).toContain('https://cart-gain.com/r/cart-1?c=whatsapp&to=checkout&code=SAVE15')
    expect(body[2]).toContain('https://cart-gain.com/r/cart-1?c=whatsapp&to=bargain')
  })

  it('never mentions a code when the merchant disabled discounts', async () => {
    await processAbandonedCarts(25)

    const body: string[] = lastWhatsAppParams().body
    expect(body[2]).not.toContain('Use code')
    expect(body[2]).toContain('https://cart-gain.com/r/cart-1?c=whatsapp&to=checkout')
    expect(body[2]).toContain('to=bargain')
  })

  it('emails the offer, the checkout link and the bargain link', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      campaign({
        channels: ['email'],
        discountEnabled: true,
        discountType: 'percentage',
        discountValue: 10,
        discountCode: 'SAVE10',
      }),
    ])
    prismaMock.cart.findMany.mockReset()
    prismaMock.cart.findMany.mockResolvedValueOnce([cart({ customerEmail: 'priya@example.com' })]).mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const opts = abandonedTemplateMock.mock.calls[0][8] as any
    expect(opts.offer).toMatchObject({ code: 'SAVE10', value: 10, type: 'percentage' })
    expect(opts.checkoutUrl).toBe('https://cart-gain.com/r/cart-1?c=email&to=checkout&code=SAVE10')
    expect(opts.bargainUrl).toBe('https://cart-gain.com/r/cart-1?c=email&to=bargain')
  })

  it('does not send the cart a runnable offer when the store is disconnected', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      campaign({ discountEnabled: true, discountType: 'percentage', discountValue: 10, discountCode: null }),
    ])

    await processAbandonedCarts(25)

    const body: string[] = lastWhatsAppParams().body
    expect(body[2]).not.toContain('Use code')
  })
})
