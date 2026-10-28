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
    cart: { findMany: jest.fn(async () => []) },
    optOut: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    customerIdentity: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'identity-1', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    message: { updateMany: jest.fn(async () => ({ count: 0 })) },
    recoveryJourney: { updateMany: jest.fn(async () => ({ count: 0 })) },
    recoveryReminder: { updateMany: jest.fn(async () => ({ count: 0 })) },
  },
}))

jest.mock('@/lib/redis', () => ({ redisLPush: jest.fn(async () => {}) }))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock; findMany: jest.Mock }
  cart: { findMany: jest.Mock }
  optOut: { findUnique: jest.Mock; create: jest.Mock; deleteMany: jest.Mock }
  customerIdentity: {
    findMany: jest.Mock
    create: jest.Mock
    update: jest.Mock
    updateMany: jest.Mock
  }
  message: { updateMany: jest.Mock }
  recoveryJourney: { updateMany: jest.Mock }
  recoveryReminder: { updateMany: jest.Mock }
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
  prismaMock.cart.findMany.mockResolvedValue([])
  prismaMock.customerIdentity.findMany.mockResolvedValue([])
  prismaMock.customerIdentity.create.mockResolvedValue({ id: 'identity-1' })
  prismaMock.customerIdentity.update.mockResolvedValue({ id: 'identity-1' })
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

  it('ignores a legacy per-store mapping of the shared sender', async () => {
    const previous = process.env.WHATSAPP_PHONE_NUMBER_ID
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'SHARED'
    try {
      prismaMock.store.findFirst.mockResolvedValue({ id: 'legacy-shared-store' })
      prismaMock.store.findMany.mockResolvedValue([{ id: 'store-a' }, { id: 'store-b' }])
      const res = await POST(signedRequest(bodyWithText('STOP', 'SHARED')))
      expect(res.status).toBe(200)
      expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
      expect(prismaMock.optOut.create).not.toHaveBeenCalled()
    } finally {
      if (previous === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID
      else process.env.WHATSAPP_PHONE_NUMBER_ID = previous
    }
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

  it('records explicit WhatsApp consent on START and clears the opt-out row', async () => {
    prismaMock.customerIdentity.create.mockResolvedValue({
      id: 'identity-1',
      storeId: 'only-store',
      phone: '+919876543210',
      consentWhatsApp: false,
      consentAt: null,
      consentSource: null,
    })
    const res = await POST(signedRequest(bodyWithText('START')))
    expect(res.status).toBe(200)
    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'identity-1' },
        data: expect.objectContaining({
          consentWhatsApp: true,
          whatsappConsentSource: 'whatsapp_keyword',
          suppressed: false,
          optedOutAt: null,
        }),
      }),
    )
    expect(prismaMock.optOut.deleteMany).toHaveBeenCalled()
  })

  it('does not treat ordinary chat as consent', async () => {
    const res = await POST(signedRequest(bodyWithText('do you have this in blue?')))
    expect(res.status).toBe(200)
    expect(prismaMock.customerIdentity.update).not.toHaveBeenCalled()
  })
})
