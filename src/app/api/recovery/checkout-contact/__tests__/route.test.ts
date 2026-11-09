/**
 * @jest-environment node
 */
import { POST, OPTIONS } from '../route'
import prisma from '@/lib/db'
import { upsertRecipient } from '@/lib/recovery/recipients'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    cart: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('@/lib/recovery/recipients', () => ({
  normalizeRecipientEmail: (email: string | null | undefined) =>
    email ? email.trim().toLowerCase() : null,
  normalizeRecipientPhone: (phone: string | null | undefined) => {
    if (!phone) return null
    const digits = phone.replace(/\D/g, '')
    return digits.length === 10 ? `+91${digits}` : `+${digits}`
  },
  upsertRecipient: jest.fn(),
}))

jest.mock('@/lib/stores/resolve-by-domain', () => ({
  resolveActiveStoreIdByShopDomain: jest.fn(),
}))

const prismaMock = prisma as any
const recipientMock = upsertRecipient as jest.Mock
const rateMock = checkSimpleRateLimit as jest.Mock
const storeMock = resolveActiveStoreIdByShopDomain as jest.Mock

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('https://cart-gain.com/api/recovery/checkout-contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      shop: 'test.myshopify.com',
      cartToken: 'checkout-token-1',
      name: 'Priya Sharma',
      email: 'Buyer@Example.com',
      phone: '+91 98765 43210',
      ...body,
    }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  storeMock.mockResolvedValue('store-1')
  prismaMock.cart.findUnique.mockResolvedValue({
    id: 'cart-1',
    customerEmail: null,
    customerPhone: null,
    customerName: null,
  })
  prismaMock.cart.update.mockResolvedValue({})
  recipientMock.mockResolvedValue({ id: 'identity-1' })
  rateMock.mockResolvedValue({ allowed: true, retryAfter: 0 })
})

describe('POST /api/recovery/checkout-contact', () => {
  it('attaches checkout contact fields to the captured cart without consent', async () => {
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      linkedCart: true,
      hasEmail: true,
      hasPhone: true,
      hasName: true,
      identityId: 'identity-1',
    })
    expect(prismaMock.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: {
        customerEmail: 'buyer@example.com',
        customerPhone: '+919876543210',
        customerName: 'Priya Sharma',
      },
    })
    expect(recipientMock).toHaveBeenCalledWith({
      storeId: 'store-1',
      name: 'Priya Sharma',
      email: 'buyer@example.com',
      phone: '+919876543210',
      source: 'shopify_checkout_contact',
    })
  })

  it('never overwrites contact fields the cart already has', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      customerEmail: 'existing@example.com',
      customerPhone: '+919999999999',
      customerName: 'Existing Name',
    })

    const res = await POST(makeRequest({ phone: null }))
    expect(res.status).toBe(200)
    expect(prismaMock.cart.update).not.toHaveBeenCalled()
    expect(recipientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'buyer@example.com',
        phone: '+919999999999',
        name: 'Priya Sharma',
        source: 'shopify_checkout_contact',
      }),
    )
  })

  it('rejects unknown carts so a token cannot create arbitrary records', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(null)

    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
    expect(prismaMock.cart.update).not.toHaveBeenCalled()
    expect(recipientMock).not.toHaveBeenCalled()
  })

  it('returns a no-op when there is no contact to store', async () => {
    const res = await POST(makeRequest({ name: null, email: null, phone: null }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, linkedCart: false })
    expect(prismaMock.cart.findUnique).not.toHaveBeenCalled()
  })

  it('rate limits repeated contact submissions', async () => {
    rateMock
      .mockResolvedValueOnce({ allowed: true, retryAfter: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 30 })

    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect(prismaMock.cart.update).not.toHaveBeenCalled()
  })

  it('answers CORS preflight', async () => {
    const res = await OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
