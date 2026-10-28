/**
 * @jest-environment node
 */
import { POST, OPTIONS } from '../route'
import prisma from '@/lib/db'
import { recordRecipientConsent } from '@/lib/recovery/recipients'
import { createOrUpdateJourney } from '@/lib/recovery/journeys/service'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { buildProductContext } from '@/lib/bargain/product-fetcher'

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
}))

jest.mock('@/lib/recovery/journeys/service', () => ({
  createOrUpdateJourney: jest.fn(),
}))

jest.mock('@/lib/bargain/product-fetcher', () => ({
  buildProductContext: jest.fn(),
}))

const prismaMock = prisma as any
const consentMock = recordRecipientConsent as jest.Mock
const journeyMock = createOrUpdateJourney as jest.Mock
const rateMock = checkSimpleRateLimit as jest.Mock
const productContextMock = buildProductContext as jest.Mock

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('https://cart-gain.com/api/recovery/opt-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      shop: 'test.myshopify.com',
      email: 'Buyer@Example.com',
      phone: '+91 98765 43210',
      consentEmail: true,
      consentWhatsApp: true,
      source: 'storefront_product',
      productId: 'gid://shopify/Product/1',
      productTitle: 'Sneaker',
      productUrl: 'https://test.myshopify.com/products/sneaker',
      productImage: 'https://cdn.shopify.com/sneaker.jpg',
      ...body,
    }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.store.findFirst.mockResolvedValue({ id: 'store-1' })
  prismaMock.cart.findUnique.mockResolvedValue(null)
  prismaMock.cart.update.mockResolvedValue({})
  prismaMock.recoveryJourney.findFirst.mockResolvedValue(null)
  consentMock.mockResolvedValue({ id: 'identity-1' })
  journeyMock.mockResolvedValue({ id: 'journey-1' })
  rateMock.mockResolvedValue({ allowed: true, retryAfter: 0 })
  productContextMock.mockResolvedValue({
    fetchFailed: false,
    title: 'Sneaker',
    productUrl: 'https://test.myshopify.com/products/sneaker',
    imageUrl: 'https://cdn.shopify.com/sneaker.jpg',
  })
})

describe('POST /api/recovery/opt-in', () => {
  it('stores explicit email + WhatsApp consent and schedules a product reminder', async () => {
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, email: true, whatsapp: true, reminderScheduled: true })
    expect(consentMock).toHaveBeenCalledWith({
      storeId: 'store-1',
      email: 'buyer@example.com',
      phone: '+919876543210',
      name: null,
      source: 'storefront_product_opt_in',
      consentEmail: true,
      consentWhatsApp: true,
      overrideOptOut: false,
    })
    expect(productContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'store-1', shopifyProductId: 'gid://shopify/Product/1' }),
    )
    expect(journeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        journeyType: 'product_browse',
        customerIdentityId: 'identity-1',
        productId: 'gid://shopify/Product/1',
        metadata: expect.objectContaining({
          source: 'storefront_product',
          productTitle: 'Sneaker',
          productUrl: 'https://test.myshopify.com/products/sneaker',
        }),
      }),
    )
  })

  it('ignores client-supplied product copy and links in favour of verified Shopify data', async () => {
    const res = await POST(
      makeRequest({
        productTitle: 'Your account is locked',
        productUrl: 'https://phishing.example/login',
        productImage: 'https://phishing.example/logo.png',
      }),
    )

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

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reminderScheduled).toBe(false)
    expect(journeyMock).not.toHaveBeenCalled()
  })

  it('links an existing cart, fills missing contact fields, and does not double-schedule', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({
      id: 'cart-row-1',
      customerEmail: null,
      customerPhone: null,
      customerName: null,
      convertedAt: null,
      isRecovered: false,
    })

    const res = await POST(
      makeRequest({ source: 'storefront_cart', cartToken: 'cart-token-1' }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.linkedCart).toBe(true)
    expect(prismaMock.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-row-1' },
      data: {
        customerEmail: 'buyer@example.com',
        customerPhone: '+919876543210',
      },
    })
    expect(journeyMock).not.toHaveBeenCalled()
  })

  it('never overwrites an existing cart contact', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({
      id: 'cart-row-1',
      customerEmail: 'existing@example.com',
      customerPhone: '+919111111111',
      customerName: 'Existing',
      convertedAt: null,
      isRecovered: false,
    })

    await POST(makeRequest({ source: 'storefront_cart', cartToken: 'cart-token-1' }))

    expect(prismaMock.cart.update).not.toHaveBeenCalled()
  })

  it('rejects WhatsApp consent without a valid phone', async () => {
    const res = await POST(makeRequest({ phone: null }))
    expect(res.status).toBe(400)
    expect(consentMock).not.toHaveBeenCalled()
  })

  it('rejects a submission with no reminder channel selected', async () => {
    const res = await POST(makeRequest({ consentEmail: false, consentWhatsApp: false }))
    expect(res.status).toBe(400)
    expect(consentMock).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown or unconnected shop', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
    expect(consentMock).not.toHaveBeenCalled()
  })

  it('rate-limits opt-in abuse', async () => {
    rateMock.mockResolvedValueOnce({ allowed: false, retryAfter: 60 })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
  })

  it('answers CORS preflight for the storefront', async () => {
    const res = await OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })
})
