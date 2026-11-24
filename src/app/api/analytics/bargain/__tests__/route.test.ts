/**
 * @jest-environment node
 */
import { GET } from '@/app/api/analytics/bargain/route'
import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { NextRequest } from 'next/server'
import { bargainRequestMetrics } from '@/lib/bargain/request-metrics'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainSession: { findMany: jest.fn() },
    bargainMessage: { findMany: jest.fn() },
    bargainExperienceEvent: { groupBy: jest.fn(), findMany: jest.fn() },
    bargainLearningEvent: { findMany: jest.fn() },
    productEvent: { findMany: jest.fn() },
  },
}))

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainSession: { findMany: jest.Mock }
  bargainMessage: { findMany: jest.Mock }
  bargainExperienceEvent: { groupBy: jest.Mock; findMany: jest.Mock }
  bargainLearningEvent: { findMany: jest.Mock }
  productEvent: { findMany: jest.Mock }
}
const authMock = getServerSession as jest.Mock

afterAll(() => {
  bargainRequestMetrics.reset()
})

function request(days = 30) {
  return new NextRequest(`https://cart-gain.com/api/analytics/bargain?storeId=store-1&days=${days}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  bargainRequestMetrics.reset()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  prismaMock.store.findFirst.mockResolvedValue({ id: 'store-1' })
  prismaMock.bargainMessage.findMany.mockResolvedValue([{ sessionId: 's1' }])
  prismaMock.bargainExperienceEvent.groupBy.mockResolvedValue([
    { eventType: 'invitation_impression', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper', _count: { _all: 10 } },
    { eventType: 'invitation_click', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper', _count: { _all: 5 } },
    { eventType: 'chat_open', designVariant: 'unlock-your-deal', personality: 'strict_shopkeeper', _count: { _all: 4 } },
  ])
  prismaMock.bargainLearningEvent.findMany.mockResolvedValue([])
  prismaMock.productEvent.findMany.mockResolvedValue([])
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
      experimentArm: 'treatment',
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
      experimentArm: 'control',
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

it('reports deterministic sales intelligence mindset, objections, recommendation posture and overhead', async () => {
  prismaMock.productEvent.findMany.mockResolvedValue([
    { properties: { sessionId: 's1', readiness: 'evaluating', objectionCategory: 'PRICE_OBJECTION', recommendation: 'none', state: 'COUNTER_OFFER', validationChecked: true, floorSafe: true, validationReason: 'OFFER_ACCEPTED', agentCount: 5, llmCalls: 0, durationMs: 2, offerBasis: 'total', offerClarificationNeeded: false, trendUsed: true, trendRegion: 'IN' } },
    { properties: { sessionId: 's1', readiness: 'ready', objectionCategory: 'BUDGET_OBJECTION', recommendation: 'suggest_now', state: 'PURCHASE_READY', validationChecked: true, floorSafe: false, validationReason: 'BELOW_FLOOR_REJECTED', agentCount: 5, llmCalls: 0, durationMs: 6, offerBasis: 'per_unit', offerClarificationNeeded: false } },
    { properties: { sessionId: 's0', readiness: 'exploring', objectionCategory: 'PRICE_OBJECTION', recommendation: 'none', state: 'PRODUCT_DISCOVERY', validationChecked: true, floorSafe: true, validationReason: 'AMBIGUOUS_OFFER_BASIS', agentCount: 5, llmCalls: 0, durationMs: 10, offerBasis: 'unclear', offerClarificationNeeded: true } },
  ])

  const body = await (await GET(request())).json()

  expect(body.intelligence).toMatchObject({
    turns: 3,
    sessions: 2,
    validation: { checkedTurns: 3, compliantTurns: 2, blockedTurns: 1 },
    clarificationTurns: 1,
    overhead: { llmCalls: 0, agentContributions: 15, avgAgentContributions: 5, avgDurationMs: 6, p95DurationMs: 10 },
    trend: { turns: 1, share: 33.3 },
  })
  expect(body.intelligence.trend.regions.find((row: any) => row.key === 'IN')).toMatchObject({ turns: 1, share: 100 })
  expect(body.intelligence.offerBases.find((row: any) => row.key === 'total')).toMatchObject({ turns: 1, share: 33.3 })
  expect(body.intelligence.offerBases.find((row: any) => row.key === 'per_unit')).toMatchObject({ turns: 1 })
  expect(body.intelligence.offerBases.find((row: any) => row.key === 'unclear')).toMatchObject({ turns: 1 })
  expect(body.intelligence.readiness.find((row: any) => row.key === 'evaluating')).toMatchObject({ turns: 1, share: 33.3 })
  expect(body.intelligence.objections.find((row: any) => row.key === 'PRICE_OBJECTION')).toMatchObject({ turns: 2, share: 66.7 })
  expect(body.intelligence.recommendations.find((row: any) => row.key === 'suggest_now')).toMatchObject({ turns: 1 })
  expect(body.intelligence.validation.reasons.find((row: any) => row.key === 'BELOW_FLOOR_REJECTED')).toMatchObject({ turns: 1 })
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
  expect(prismaMock.productEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      name: 'cartgain_bargain_intelligence_turn',
      storeId: 'store-1',
      createdAt: { gte: expect.any(Date) },
    }),
  }))
})

it('reports deterministic holdout cohorts and counts only verified purchases', async () => {
  const body = await (await GET(request())).json()
  const treatment = body.experiments.arms.find((row: any) => row.key === 'treatment')
  const control = body.experiments.arms.find((row: any) => row.key === 'control')
  expect(treatment).toMatchObject({ sessions: 1, accepted: 1, purchased: 1, revenue: 900, evidence: 'insufficient' })
  expect(control).toMatchObject({ sessions: 1, accepted: 0, purchased: 0, revenue: 0 })
  expect(body.experiments.enabled).toBe(false)
  expect(body.experiments.note).toMatch(/observational/i)
})

it('exposes in-process request metrics without changing learning-derived performance', async () => {
  bargainRequestMetrics.record('offer_total', 12)

  const body = await (await GET(request())).json()

  expect(body.requestMetrics).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: 'offer_total', count: 1, p50: 12 }),
  ]))
  expect(body.performance).toMatchObject({
    samples: 0,
    note: expect.stringContaining('learning events'),
  })
})

it('marks the experiment as active when the dual-agent flag is enabled', async () => {
  const prev = process.env.BARGAIN_DUAL_AGENT
  process.env.BARGAIN_DUAL_AGENT = 'true'
  try {
    const body = await (await GET(request())).json()
    expect(body.experiments.enabled).toBe(true)
    expect(body.experiments.note).toMatch(/baseline engine/i)
  } finally {
    if (prev == null) delete process.env.BARGAIN_DUAL_AGENT
    else process.env.BARGAIN_DUAL_AGENT = prev
  }
})

it('adds transparent contribution metrics without inventing profit', async () => {
  const body = await (await GET(request())).json()
  expect(body.contribution).toMatchObject({
    status: 'insufficient_cost_data',
    verified: { netSales: 900, grossSales: 900, refunds: 0, discounts: 0 },
    contributionProfit: null,
    netAfterCartGainSubscription: null,
  })
  expect(body.contribution.experiment.enabled).toBe(false)
  expect(body.contribution.experiment.incrementalNetSalesPerEligible).toBeNull()
  expect(body.contribution.notes.join(' ')).toContain('verified order attribution')
})
