/**
 * @jest-environment node
 */
import { GET } from '@/app/api/analytics/bargain/route'
import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainSession: { findMany: jest.fn() },
    bargainMessage: { findMany: jest.fn() },
    bargainExperienceEvent: { groupBy: jest.fn(), findMany: jest.fn() },
  },
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainSession: { findMany: jest.Mock }
  bargainMessage: { findMany: jest.Mock }
  bargainExperienceEvent: { groupBy: jest.Mock; findMany: jest.Mock }
}
const authMock = getServerSession as jest.Mock

function request(days = 30) {
  return new NextRequest(`https://cart-gain.com/api/analytics/bargain?storeId=store-1&days=${days}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  prismaMock.store.findFirst.mockResolvedValue({ id: 'store-1' })
  prismaMock.bargainMessage.findMany.mockResolvedValue([{ sessionId: 's1' }])
  prismaMock.bargainExperienceEvent.groupBy.mockResolvedValue([
    { eventType: 'invitation_impression', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper', _count: { _all: 10 } },
    { eventType: 'invitation_click', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper', _count: { _all: 5 } },
    { eventType: 'chat_open', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper', _count: { _all: 4 } },
  ])
  prismaMock.bargainExperienceEvent.findMany.mockResolvedValue([
    { visitorKey: 'v1', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper' },
    { visitorKey: 'v2', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper' },
  ])
  prismaMock.bargainSession.findMany.mockResolvedValue([
    {
      id: 's1',
      startedAt: new Date(),
      status: 'accepted',
      originalPrice: 1000,
      finalPrice: 900,
      discountCode: 'GAIN1',
      purchasedAt: new Date(),
      purchaseValue: 900,
      experienceDesign: 'unlock-your-deal',
      experiencePersonality: 'strict_shopkeeper',
      _count: { messages: 3 },
    },
    {
      id: 's0',
      startedAt: new Date(),
      status: 'active',
      originalPrice: 500,
      finalPrice: null,
      discountCode: null,
      purchasedAt: null,
      purchaseValue: null,
      experienceDesign: null,
      experiencePersonality: null,
      _count: { messages: 0 },
    },
  ])
})

it('keeps the existing session funnel intact and adds experience metrics', async () => {
  const res = await GET(request())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.funnel).toMatchObject({ started: 2, offered: 1, accepted: 1, issued: 1, purchased: 1, revenue: 900 })
  expect(body.experience).toMatchObject({
    impressions: 10,
    clicks: 5,
    chatOpens: 4,
    uniqueVisitors: 2,
    ctr: 50,
    clickToChatRate: 80,
  })
})

it('attributes historical revenue to the session snapshot and reports unknown separately', async () => {
  const body = await (await GET(request())).json()
  const design = body.experience.designs.find((row: any) => row.key === 'unlock-your-deal')
  const unknown = body.experience.designs.find((row: any) => row.key === 'unknown')
  expect(design).toMatchObject({ sessions: 1, accepted: 1, purchased: 1, revenue: 900, evidence: 'insufficient' })
  expect(unknown).toMatchObject({ sessions: 1, purchased: 0 })
  expect(design.endToEndRate).toBe(10)
})

it('scopes every query to the authenticated store and selected window', async () => {
  await GET(request(7))
  expect(prismaMock.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'store-1', userId: 'user-1' },
  }))
  expect(prismaMock.bargainExperienceEvent.groupBy).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ storeId: 'store-1', isPreview: false }),
  }))
  expect(prismaMock.bargainSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ storeId: 'store-1' }),
  }))
})
