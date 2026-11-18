/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

import { POST } from '@/app/api/bargain/checkout-open/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'

const mockPrisma = prisma as any

function request(body: Record<string, unknown>) {
  return new Request('https://cart-gain.com/api/bargain/checkout-open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.bargainSession.updateMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/bargain/checkout-open', () => {
  it('marks checkout open only for the session owner', async () => {
    mockPrisma.bargainSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      customerFingerprint: 'fp-12345678',
      customerEmail: null,
      cartToken: 'cart-1',
      purchaseUrl: 'https://shop.example/discount/BARGAIN-TEST',
      discountCode: 'BARGAIN-TEST',
      status: 'rejected',
      checkoutOpenedAt: null,
    })

    const res = await POST(request({
      sessionId: 'sess-1',
      customerFingerprint: 'fp-12345678',
      cartToken: 'cart-1',
      sessionToken: signSessionToken('sess-1'),
    }))

    expect(res.status).toBe(200)
    expect(mockPrisma.bargainSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sess-1', checkoutOpenedAt: null },
      data: { checkoutOpenedAt: expect.any(Date) },
    }))
  })

  it('rejects a caller who cannot prove ownership', async () => {
    mockPrisma.bargainSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      customerFingerprint: 'fp-12345678',
      customerEmail: null,
      cartToken: 'cart-1',
      purchaseUrl: 'https://shop.example/discount/BARGAIN-TEST',
      discountCode: 'BARGAIN-TEST',
      status: 'rejected',
      checkoutOpenedAt: null,
    })

    const res = await POST(request({
      sessionId: 'sess-1',
      customerFingerprint: 'someone-else',
      cartToken: 'other-cart',
    }))

    expect(res.status).toBe(403)
    expect(mockPrisma.bargainSession.updateMany).not.toHaveBeenCalled()
  })
})
