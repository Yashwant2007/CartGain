/**
 * @jest-environment node
 */
import { POST, OPTIONS } from '../route'
import prisma from '@/lib/db'
import {
  normalizeRecipientEmail,
  normalizeRecipientPhone,
  recordRecipientConsent,
  upsertRecipient,
} from '@/lib/recovery/recipients'
import { createOrUpdateJourney } from '@/lib/recovery/journeys/service'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { buildProductContext } from '@/lib/bargain/product-fetcher'
import { buildOptInConfirmationUrl } from '@/lib/recovery/opt-in-confirmation'
import { sendEmail } from '@/lib/services/email'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    cart: { findUnique: jest.fn(), update: jest.fn() },
    recoveryJourney: { findFirst: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('@/lib/recovery/recipients', () => ({
  normalizeRecipientEmail: (email: string | null | undefined) =>
    email ? email.trim().toLowerCase() : null,
  normalizeRecipientPhone: (phone: string | null | undefined) =>
    phone ? `+${phone.replace(/\D/g, '')}` : null,
  recordRecipientConsent: jest.fn(),
  upsertRecipient: jest.fn(),
}))

jest.mock('@/lib/recovery/journeys/service', () => ({
  createOrUpdateJourney: jest.fn(),
}))

jest.mock('@/lib/bargain/product-fetcher', () => ({
  buildProductContext: jest.fn(),
}))

jest.mock('@/lib/recovery/opt-in-confirmation', () => ({
  buildOptInConfirmationUrl: jest.fn(() => 'https://cart-gain.com/api/recovery/confirm?token=t'),
}))

jest.mock('@/lib/services/email', () => ({
  sendEmail: jest.fn(async () => ({ success: true, messageId: 'em_1' })),
}))

const prismaMock = prisma as any
const consentMock = recordRecipientConsent as jest.Mock
const upsertMock = upsertRecipient as jest.Mock
const journeyMock = createOrUpdateJourney as jest.Mock
const rateMock = checkSimpleRateLimit as jest.Mock
const productContextMock = buildProductContext as jest.Mock
const confirmUrlMock = buildOptInConfirmationUrl as jest.Mock
const emailMock = sendEmail as jest.Mock

function makeRequest(body: Record<string, unknown> = {}, origin = 'https://test.myshopify.com') {
  return new Request('https://cart-gain.com/api/recovery/opt-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      shop: 'test.myshopify.com',
      email: 'Buyer@Example.com',
      phone: '+91 98765 43210',
      consentEmail: true,
      consentWhatsApp: true,
      source: 'storefront_product',
      productId: 'gid://shopify/Product/1',
      ...body,
    }),
  }) as any
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-1',
    email: 'buyer@example.com',
    phone: '+919876543210',
    name: null,
    consentEmail: false,
    consentWhatsApp: false,
    suppressed: false,
    optedOutAt: null,
    ...overrides,
  }
}

function cart(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cart-row-1',
    customerEmail: null,
    customerPhone: null,
    customerName: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.store.findFirst.mockResolvedValue({ id: 'store-1' })
  prismaMock.cart.findUnique.mockResolvedValue(null)
  prismaMock.cart.update.mockResolvedValue({})
  prismaMock.recoveryJourney.findFirst.mockResolvedValue(null)
  upsertMock.mockResolvedValue(identity())
  consentMock.mockResolvedValue(identity({ consentEmail: true }))
  journeyMock.mockResolvedValue({ id: 'journey-1' })
  rateMock.mockResolvedValue({ allowed: true, retryAfter: 0 })
  productContextMock.mockResolvedValue({
    fetchFailed: false,
    title: 'Sneaker',
    productUrl: 'https://test.myshopify.com/products/sneaker',
    imageUrl: 'https://cdn.shopify.com/sneaker.jpg',
  })
  confirmUrlMock.mockReturnValue('https://cart-gain.com/api/recovery/confirm?token=t')
  emailMock.mockResolvedValue({ success: true, messageId: 'em_1' })
})

describe('POST /api/recovery/opt-in', () => {
  it('requires email confirmation and inbound START for an untrusted storefront form', async () => {
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      email: false,
      emailConfirmationSent: true,
      whatsapp: false,
      whatsappConfirmationRequired: true,
      reminderScheduled: false,
    })
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        email: 'buyer@example.com',
        phone: '+919876543210',
        source: 'storefront_product_opt_in',
      }),
    )
    expect(consentMock).not.toHaveBeenCalled()
    expect(journeyMock).not.toHaveBeenCalled()
    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@example.com', subject: 'Confirm your CartGain reminders' }),
    )
  })

  it('grants email immediately when checkout supplied the trusted contact', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(
      cart({ customerEmail: 'buyer@example.com', customerPhone: '+919876543210' }),
    )
    const res = await POST(makeRequest({ source: 'checkout_extension', cartToken: 'cart-token-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ email: true, whatsapp: false, whatsappConfirmationRequired: true })
    expect(consentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        email: 'buyer@example.com',
        consentEmail: true,
        consentWhatsApp: false,
      }),
    )
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('links a cart, fills missing contact fields, and never double-schedules', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cart())
    const res = await POST(makeRequest({ source: 'storefront_cart', cartToken: 'cart-token-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.linkedCart).toBe(true)
    expect(body.emailConfirmationSent).toBe(true)
    expect(prismaMock.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-row-1' },
      data: {
        customerEmail: 'buyer@example.com',
        customerPhone: '+919876543210',
      },
    })
    expect(journeyMock).not.toHaveBeenCalled()
  })

  it('stores the supplied name on the identity and fills a blank cart name', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(
      cart({ customerEmail: 'buyer@example.com', customerPhone: '+919876543210' }),
    )
    const res = await POST(
      makeRequest({ name: '  Priya Sharma  ', source: 'storefront_cart', cartToken: 'cart-token-1' }),
    )

    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Priya Sharma' }))
    expect(prismaMock.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-row-1' },
      data: { customerName: 'Priya Sharma' },
    })
  })

  it('never overwrites an existing cart contact', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(
      cart({ customerEmail: 'existing@example.com', customerPhone: '+919111111111', customerName: 'Existing' }),
    )

    await POST(makeRequest({ source: 'storefront_cart', cartToken: 'cart-token-1' }))

    expect(prismaMock.cart.update).not.toHaveBeenCalled()
  })

  it('schedules a product journey only after email consent is confirmed', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({ id: 'cart-1', customerEmail: 'buyer@example.com', customerPhone: '+919876543210', customerName: null })
    const res = await POST(makeRequest({ source: 'storefront_product', cartToken: 'cart-token-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reminderScheduled).toBe(true)
    expect(journeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        journeyType: 'product_browse',
        customerIdentityId: 'identity-1',
        productId: 'gid://shopify/Product/1',
      }),
    )
  })

  it('ignores client-supplied product copy in favour of verified Shopify data', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({ id: 'cart-1', customerEmail: 'buyer@example.com', customerPhone: '+919876543210', customerName: null })
    prismaMock.recoveryJourney.findFirst.mockResolvedValue(null)
    const res = await POST(makeRequest({
      source: 'storefront_product',
      cartToken: 'cart-token-1',
      productTitle: 'Your account is locked',
      productUrl: 'https://phishing.example/login',
      productImage: 'https://phishing.example/logo.png',
    }))

    expect(res.status).toBe(200)
    expect(journeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          productTitle: 'Sneaker',
          productUrl: 'https://test.myshopify.com/products/sneaker',
          productImage: 'https://cdn.shopify.com/sneaker.jpg',
        }),
      }),
    )
    expect(JSON.stringify(journeyMock.mock.calls[0][0])).not.toContain('phishing.example')
  })

  it('does not schedule a reminder when the product cannot be verified', async () => {
    productContextMock.mockResolvedValue({ fetchFailed: true, title: 'Sneaker' })

    prismaMock.cart.findUnique.mockResolvedValue({ id: 'cart-1', customerEmail: 'buyer@example.com', customerPhone: '+919876543210', customerName: null })
    const res = await POST(makeRequest({ cartToken: 'cart-token-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reminderScheduled).toBe(false)
    expect(journeyMock).not.toHaveBeenCalled()
  })

  it('does not grant WhatsApp consent from a typed phone number alone', async () => {
    upsertMock.mockResolvedValue(identity({ consentWhatsApp: false }))
    const res = await POST(
      makeRequest({ consentEmail: false, consentWhatsApp: true, source: 'checkout_extension' }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ whatsapp: false, whatsappConfirmationRequired: true })
    expect(consentMock).not.toHaveBeenCalled()
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('rejects WhatsApp consent without a valid phone', async () => {
    const res = await POST(makeRequest({ phone: null }))
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('rejects unknown opt-in sources', async () => {
    const res = await POST(makeRequest({ source: 'attacker' }))
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('rejects a submission with no reminder channel selected', async () => {
    const res = await POST(makeRequest({ consentEmail: false, consentWhatsApp: false }))
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown or unconnected shop', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('rate-limits opt-in abuse', async () => {
    rateMock.mockResolvedValueOnce({ allowed: false, retryAfter: 60 })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
  })

  it('allows Shopify and CartGain preflight origins but not arbitrary sites', async () => {
    const allowed = await OPTIONS({ headers: { get: () => 'https://shop.myshopify.com' } } as any)
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://shop.myshopify.com')

    const denied = await OPTIONS({ headers: { get: () => 'https://evil.example' } } as any)
    expect(denied.status).toBe(204)
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })
})
