/**
 * @jest-environment node
 *
 * Regression tests for the public opt-out hardening: an unauthenticated request
 * that cannot present a valid signed token must NOT be able to suppress a
 * contact (previously anyone could mass-opt-out arbitrary emails/phones).
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/opt-out/route'
import prisma from '@/lib/db'
import { signOptOutToken } from '@/lib/opt-out'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findUnique: jest.fn(), findFirst: jest.fn() },
    optOut: { findUnique: jest.fn(), create: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(async () => null),
}))

jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const prismaMock = prisma as unknown as {
  store: { findUnique: jest.Mock; findFirst: jest.Mock }
  optOut: { findUnique: jest.Mock; create: jest.Mock }
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://cart-gain.com/api/opt-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.optOut.findUnique.mockResolvedValue(null)
  prismaMock.optOut.create.mockResolvedValue({})
})

describe('POST /api/opt-out — hardening', () => {
  it('rejects an unauthenticated request with no token (401)', async () => {
    const res = await POST(makeRequest({ storeId: 's1', email: 'victim@example.com' }))
    expect(res.status).toBe(401)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })

  it('rejects a tampered token (403)', async () => {
    const token = signOptOutToken({ storeId: 's1', email: 'victim@example.com' })
    const res = await POST(makeRequest({ t: token.slice(0, -4) + 'AAAA' }))
    expect(res.status).toBe(403)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })

  it('accepts a valid signed token and records the opt-out', async () => {
    prismaMock.store.findUnique.mockResolvedValue({ id: 's1' })
    const token = signOptOutToken({ storeId: 's1', email: 'Victim@Example.com' })
    const res = await POST(makeRequest({ t: token }))
    expect(res.status).toBe(200)
    expect(prismaMock.optOut.create).toHaveBeenCalledWith({
      data: { storeId: 's1', reason: 'customer_request', email: 'victim@example.com' },
    })
  })

  it('404s a valid token for an unknown store', async () => {
    prismaMock.store.findUnique.mockResolvedValue(null)
    const token = signOptOutToken({ storeId: 'missing', email: 'a@b.com' })
    const res = await POST(makeRequest({ t: token }))
    expect(res.status).toBe(404)
    expect(prismaMock.optOut.create).not.toHaveBeenCalled()
  })
})
