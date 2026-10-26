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

afterEach(() => {
  delete process.env.WHATSAPP_TEMPLATE_IMAGE_HEADER
  delete process.env.WHATSAPP_TEMPLATE_BUTTON_BASE
  delete process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1266364546554326'
  process.env.WHATSAPP_BUSINESS_TOKEN = 'test-token'
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

  it('uses the first name in the greeting slot and the offer line', async () => {
    prismaMock.cart.findMany.mockReset()
    prismaMock.cart.findMany
      .mockResolvedValueOnce([cart({ customerName: 'Priya Sharma' })])
      .mockResolvedValue([])

    await processAbandonedCarts(25)

    const body: string[] = lastWhatsAppParams().body
    expect(body[0]).toBe('Priya')
    expect(body[2]).toMatch(/^Priya, /)
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

  it('always sends the image header the approved template declares', async () => {
    process.env.WHATSAPP_TEMPLATE_IMAGE_HEADER = 'true'

    await processAbandonedCarts(25)

    const header = lastWhatsAppParams().header
    expect(header).toEqual({ type: 'image', imageUrl: 'https://cart-gain.com/logo.png' })
  })

  it('prefers the cart product photo over the brand fallback', async () => {
    process.env.WHATSAPP_TEMPLATE_IMAGE_HEADER = 'true'
    prismaMock.cart.findMany.mockReset()
    prismaMock.cart.findMany
      .mockResolvedValueOnce([
        cart({ items: [{ name: 'Sneaker', price: 100, quantity: 1, image: 'https://cdn.shopify.com/sneaker.png' }] }),
      ])
      .mockResolvedValue([])

    await processAbandonedCarts(25)

    expect(lastWhatsAppParams().header).toEqual({
      type: 'image',
      imageUrl: 'https://cdn.shopify.com/sneaker.png',
    })
  })

  it('sends only the dynamic button suffix, never a full url', async () => {
    process.env.WHATSAPP_TEMPLATE_BUTTON_BASE = 'https://cart-gain.com/r/'

    await processAbandonedCarts(25)

    expect(lastWhatsAppParams().buttons).toEqual([
      { type: 'url', text: 'Complete Purchase', url: 'cart-1?c=whatsapp' },
    ])
  })

  it('processes every eligible store in one sweep instead of exactly one', async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      campaign({ id: 'camp-1', store: { id: 'store-1', currency: 'INR', timezone: 'UTC', name: 'A', domain: 'a.myshopify.com' } }),
      campaign({ id: 'camp-2', store: { id: 'store-2', currency: 'INR', timezone: 'UTC', name: 'B', domain: 'b.myshopify.com' } }),
    ])
    prismaMock.cart.findMany.mockReset()
    prismaMock.cart.findMany
      .mockResolvedValueOnce([cart({ id: 'cart-1' })])
      .mockResolvedValueOnce([cart({ id: 'cart-2' })])
      .mockResolvedValue([])

    const result = await processAbandonedCarts(25)

    expect(result.storesProcessed).toBe(2)
    expect(sendWhatsAppMock).toHaveBeenCalledTimes(2)
    expect(result.nextCursor).toBeUndefined()
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
