/**
 * @jest-environment node
 */
import { POST } from '@/app/api/bargain/experience/event/route'
import prisma from '@/lib/db'
import { NextRequest } from 'next/server'
import { DEFAULT_BARGAIN_EXPERIENCE } from '@/lib/bargain/experience/types'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    bargainSession: { findFirst: jest.fn() },
    bargainExperienceEvent: { create: jest.fn() },
  },
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
  bargainSession: { findFirst: jest.Mock }
  bargainExperienceEvent: { create: jest.Mock }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('https://cart-gain.com/api/bargain/experience/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body: JSON.stringify(body),
  })
}

const valid = {
  eventId: 'event_123456',
  storeId: 'store-1',
  eventType: 'invitation_impression',
  visitorKey: 'visitor_123456',
  occurredAt: new Date().toISOString(),
  clientDesign: 'playful-bargain-club',
  clientPersonality: 'playful_shopkeeper',
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.store.findFirst.mockResolvedValue({ id: 'store-1' })
  prismaMock.bargainConfig.findUnique.mockResolvedValue({
    storeId: 'store-1',
    experiencePublished: {
      ...DEFAULT_BARGAIN_EXPERIENCE,
      designVariant: 'unlock-your-deal',
      personality: 'strict_shopkeeper',
      publishedVersion: 4,
    },
    experiencePublishedVersion: 4,
  })
  prismaMock.bargainSession.findFirst.mockResolvedValue(null)
  prismaMock.bargainExperienceEvent.create.mockResolvedValue({})
})

it('stores server-resolved design and personality, ignoring client attribution', async () => {
  const res = await POST(request(valid))
  expect(res.status).toBe(200)
  expect(prismaMock.bargainExperienceEvent.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      eventType: 'invitation_impression',
      designVariant: 'unlock-your-deal',
      personality: 'strict_shopkeeper',
      isPreview: false,
    }),
  }))
})

it('rejects preview frames and unknown event types', async () => {
  expect((await POST(request({ ...valid, isPreview: true }))).status).toBe(200)
  expect(prismaMock.bargainExperienceEvent.create).not.toHaveBeenCalled()
  expect((await POST(request({ ...valid, eventType: 'purchase' }))).status).toBe(400)
  expect(prismaMock.bargainExperienceEvent.create).not.toHaveBeenCalled()
})

it('treats a duplicate beacon as idempotent', async () => {
  prismaMock.bargainExperienceEvent.create.mockRejectedValueOnce({ code: 'P2002' })
  const res = await POST(request(valid))
  expect(res.status).toBe(200)
})

it('ignores events for stores without a bargain config', async () => {
  prismaMock.bargainConfig.findUnique.mockResolvedValueOnce(null)
  const res = await POST(request(valid))
  expect(res.status).toBe(200)
  expect(prismaMock.bargainExperienceEvent.create).not.toHaveBeenCalled()
})

it('rejects stale timestamps and missing visitor keys', async () => {
  expect((await POST(request({ ...valid, occurredAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }))).status).toBe(400)
  expect((await POST(request({ ...valid, visitorKey: '' }))).status).toBe(400)
  expect((await POST(request({ ...valid, eventId: 'bad' }))).status).toBe(400)
})
