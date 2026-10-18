/**
 * @jest-environment node
 *
 * Regression tests: an inbound WhatsApp STOP must be persisted as an OptOut for
 * the store that owns the receiving number. The previous behaviour only logged
 * the keyword, so the customer kept getting recovery messages.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhooks/whatsapp/route'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn(), findMany: jest.fn() },
    optOut: { findUnique: jest.fn(), create: jest.fn() },
  },
}))

jest.mock('@/lib/redis', () => ({ redisLPush: jest.fn(async () => {}) }))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock; findMany: jest.Mock }
  optOut: { findUnique: jest.Mock; create: jest.Mock }
}

const SECRET = 'test-meta-app-secret'

function bodyWithText(text: string, phoneNumberId = 'PN1', from = '919876543210') {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [{ id: 'wamid.M1', from, text: { body: text } }],
            },
          },
        ],
      },
    ],
  })
}

function signedRequest(raw: string, secret = SECRET) {
  const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
  return new NextRequest('https://cart-gain.com/api/webhooks/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${digest}`,
    },
    body: raw,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.WHATSAPP_APP_SECRET = SECRET
  prismaMock.store.findFirst.mockResolvedValue(null)
  prismaMock.store.findMany.mockResolvedValue([{ id: 'only-store' }])
  prismaMock.optOut.findUnique.mockResolvedValue(null)
  prismaMock.optOut.create.mockResolvedValue({})
})

describe('POST /api/webhooks/whatsapp — opt-out persistence', () => {
  it('rejects an unsigned payload (401) without touching the DB', async () => {
    const raw = bodyWithText('STOP')
    const req = new NextRequest('https://cart-gain.com/api/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })

  it('persists a STOP against the sole active store', async () => {
    const res = await POST(signedRequest(bodyWithText('STOP')))
    expect(res.status).toBe(200)
    expect(prismaMock.optOut.create).toHaveBeenCalledWith({
      data: { storeId: 'only-store', reason: 'customer_request', phone: '919876543210' },
    })
  })

  it('persists a STOP against the store matching the phone_number_id', async () => {
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store-owner' })
    const res = await POST(signedRequest(bodyWithText('stop', 'PN-owner')))
    expect(res.status).toBe(200)
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { whatsappPhoneNumberId: 'PN-owner', isActive: true },
      select: { id: true },
    })
    expect(prismaMock.optOut.create).toHaveBeenCalledWith({
      data: { storeId: 'store-owner', reason: 'customer_request', phone: '919876543210' },
    })
  })

  it('does not write when the opt-out is unambiguously unattributable', async () => {
    prismaMock.store.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    const res = await POST(signedRequest(bodyWithText('unsubscribe')))
    expect(res.status).toBe(200)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })

  it('ignores ordinary chat (no DB write)', async () => {
    const res = await POST(signedRequest(bodyWithText('is this in blue?')))
    expect(res.status).toBe(200)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })

  it('does not create a duplicate when the opt-out already exists', async () => {
    prismaMock.optOut.findUnique.mockResolvedValue({ id: 'existing' })
    const res = await POST(signedRequest(bodyWithText('STOP')))
    expect(res.status).toBe(200)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })
})
