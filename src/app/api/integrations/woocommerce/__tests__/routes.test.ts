/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    platformConnection: { findUnique: jest.fn() },
    webhookDelivery: { create: jest.fn(), updateMany: jest.fn() },
  },
}))

jest.mock('@/lib/encryption', () => ({
  decrypt: jest.fn(() => 'webhook-secret'),
  encrypt: jest.fn((value: string) => `encrypted:${value}`),
}))

jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }))

jest.mock('@/lib/woocommerce/events', () => ({
  claimPlatformEvent: jest.fn(),
  processWooWebhookEvent: jest.fn(),
  updatePlatformEvent: jest.fn(),
}))

jest.mock('@/lib/woocommerce/service', () => ({
  connectWooCommerce: jest.fn(),
  WooServiceError: class WooServiceError extends Error {
    code: string
    status: number
    constructor(code: string, status: number) {
      super(code)
      this.code = code
      this.status = status
    }
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ success: true, remaining: 9, resetTime: Date.now() + 60_000 })),
}))

import { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import prisma from '@/lib/db'
import { connectWooCommerce } from '@/lib/woocommerce/service'
import { claimPlatformEvent, processWooWebhookEvent } from '@/lib/woocommerce/events'
import { signWebhookPayload } from '@/lib/woocommerce/signature'
import { POST as webhookPOST } from '@/app/api/webhooks/woocommerce/route'
import { POST as exchangePOST } from '@/app/api/integrations/woocommerce/exchange/route'

const mockPrisma = prisma as any
const mockClaim = claimPlatformEvent as jest.Mock
const mockProcess = processWooWebhookEvent as jest.Mock
const mockConnect = connectWooCommerce as jest.Mock
const mockRateLimit = checkRateLimit as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.platformConnection.findUnique.mockResolvedValue({
    id: 'conn-1',
    storeId: 'store-1',
    platform: 'woocommerce',
    status: 'active',
    webhookSecret: 'encrypted-secret',
    store: { id: 'store-1', domain: 'https://shop.example.com', platform: 'woocommerce', webhookSecret: null },
  })
  mockPrisma.webhookDelivery.create.mockResolvedValue({})
  mockPrisma.webhookDelivery.updateMany.mockResolvedValue({ count: 1 })
  mockClaim.mockResolvedValue({ id: 'event-row-1' })
  mockConnect.mockResolvedValue({
    connected: true,
    storeId: 'store-1',
    connectionId: 'conn-1',
    platform: 'woocommerce',
    status: 'active',
    webhookUrl: 'https://cart-gain.com/api/webhooks/woocommerce',
  })
})

function webhookRequest(rawBody: string, headers: Record<string, string>) {
  return new NextRequest('https://cart-gain.com/api/webhooks/woocommerce', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  })
}

describe('POST /api/webhooks/woocommerce', () => {
  const payload = { eventId: 'evt-12345678', type: 'cart_abandoned', data: { cart: { id: 'cart-1' } } }

  it('rejects an invalid signature without processing the event', async () => {
    const res = await webhookPOST(
      webhookRequest(JSON.stringify(payload), {
        'x-cartgain-connection-id': 'conn-1',
        'x-cartgain-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-cartgain-signature': 'bad-signature',
      }),
    )

    expect(res.status).toBe(401)
    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ signatureValid: false }) }),
    )
  })

  it('acknowledges a duplicate event exactly once', async () => {
    const rawBody = JSON.stringify(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    mockClaim.mockResolvedValue(null)

    const res = await webhookPOST(
      webhookRequest(rawBody, {
        'x-cartgain-connection-id': 'conn-1',
        'x-cartgain-timestamp': timestamp,
        'x-cartgain-signature': signWebhookPayload('webhook-secret', timestamp, rawBody),
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true })
    expect(mockProcess).not.toHaveBeenCalled()
  })
})

describe('POST /api/integrations/woocommerce/exchange', () => {
  function exchangeRequest() {
    return new NextRequest('https://cart-gain.com/api/integrations/woocommerce/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'code-abcdefghijklmnop',
        storeUrl: 'https://shop.example.com',
        installId: 'install-1',
        proof: 'a'.repeat(64),
        consumerKey: 'ck_consumer_key_123',
        consumerSecret: 'cs_consumer_secret_123',
      }),
    })
  }

  it('does not return credentials from a successful exchange', async () => {
    const res = await exchangePOST(exchangeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ connected: true, connectionId: 'conn-1' })
    expect(JSON.stringify(json)).not.toContain('consumerSecret')
    expect(JSON.stringify(json)).not.toContain('cs_consumer_secret_123')
  })

  it('rate limits repeated exchange attempts', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, resetTime: Date.now() + 60_000 })
    const res = await exchangePOST(exchangeRequest())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(mockConnect).not.toHaveBeenCalled()
  })
})
