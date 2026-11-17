import { POST } from '@/app/api/bargain/recommend/event/route'
import prisma from '@/lib/db'
import { track } from '@/lib/analytics/track'
import { NextRequest } from 'next/server'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: { findUnique: jest.fn() },
    bargainMessage: { create: jest.fn() },
  },
}))

jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(async () => {}),
}))

const prismaMock = prisma as unknown as {
  bargainSession: { findUnique: jest.Mock }
  bargainMessage: { create: jest.Mock }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('https://cart-gain.com/api/bargain/recommend/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const session = {
  id: 'sess-1',
  storeId: 'store-1',
  status: 'active',
  customerFingerprint: 'fingerprint-1',
  store: { id: 'store-1' },
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.bargainSession.findUnique.mockResolvedValue(session)
  prismaMock.bargainMessage.create.mockResolvedValue({})
})

it.each([
  ['dismissed', 'cartgain_recommendation_dismissed'],
  ['rejected', 'cartgain_recommendation_rejected'],
] as const)('persists %s feedback as metadata-only history', async (action, eventName) => {
  const res = await POST(request({
    sessionId: 'sess-1',
    action,
    productId: 'gid://shopify/Product/42',
    customerFingerprint: 'fingerprint-1',
  }))

  expect(res.status).toBe(200)
  expect(prismaMock.bargainMessage.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      sessionId: 'sess-1',
      role: 'system',
      content: 'recommendation_feedback',
      metadata: expect.objectContaining({
        recommendationEvent: expect.objectContaining({ action, productId: '42' }),
      }),
    }),
  })
  expect(track).toHaveBeenCalledWith(expect.objectContaining({ name: eventName, storeId: 'store-1' }))
})

it('keeps the legacy clicked and added analytics names', async () => {
  await POST(request({ sessionId: 'sess-1', action: 'clicked', productId: '7', customerFingerprint: 'fingerprint-1' }))
  expect(track).toHaveBeenCalledWith(expect.objectContaining({ name: 'cartgain_recommendation_clicked' }))

  await POST(request({ sessionId: 'sess-1', action: 'added', productId: '7', customerFingerprint: 'fingerprint-1' }))
  expect(track).toHaveBeenCalledWith(expect.objectContaining({ name: 'cartgain_recommended_product_added' }))
})

it('rejects unknown actions', async () => {
  const res = await POST(request({ sessionId: 'sess-1', action: 'purchased', productId: '7', customerFingerprint: 'fingerprint-1' }))
  expect(res.status).toBe(400)
  expect(prismaMock.bargainMessage.create).not.toHaveBeenCalled()
})

it('does not persist feedback for another buyer', async () => {
  const res = await POST(request({ sessionId: 'sess-1', action: 'dismissed', productId: '7', customerFingerprint: 'someone-else' }))
  expect(res.status).toBe(403)
  expect(prismaMock.bargainMessage.create).not.toHaveBeenCalled()
})
