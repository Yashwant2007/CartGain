import { PUT } from '@/app/api/bargain/config/route'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}))

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn(async () => ({ user: { id: 'user-1' } })) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/bargain/goals', () => ({ getGoalStatus: jest.fn(), demoGoalFromStatus: jest.fn() }))
jest.mock('@/lib/bargain/experience/config', () => ({ applyShopkeeperPersonality: jest.fn(() => ({})) }))

const db = prisma as any

function request(body: Record<string, unknown>) {
  return new Request('https://cart-gain.com/api/bargain/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeId: 'store-1', ...body }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  db.store.findFirst.mockResolvedValue({ id: 'store-1', userId: 'user-1' })
  db.bargainConfig.findUnique.mockResolvedValue(null)
  db.bargainConfig.upsert.mockImplementation(async ({ data }: any) => data)
})

describe('PUT /api/bargain/config', () => {
  it('requires a daily goal window before enabling a goal', async () => {
    const res = await PUT(request({ goalEnabled: true }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: 'Choose a daily goal start and end time before enabling it' })
    expect(db.bargainConfig.upsert).not.toHaveBeenCalled()
  })

  it('persists every selected merchant option in one bounded write', async () => {
    const body = {
      enabled: true,
      maxAttempts: 4,
      minProfitPercent: 20,
      goalEnabled: true,
      goalType: 'orders',
      goalTarget: 10,
      goalStartTime: '2026-11-25T00:00:00.000Z',
      goalEndTime: '2026-11-25T23:59:00.000Z',
      goalTimezone: 'Asia/Kolkata',
      dynamicStrategyEnabled: true,
      negotiationMode: 'flexible',
      negotiationStyle: 'budget_advisor',
      abuseStrictness: 'strict',
      recommendationsEnabled: true,
      alternativeRecommendationsEnabled: true,
      couponStackingEnabled: true,
      dwellNudgeEnabled: true,
      dwellSeconds: 12,
      dwellReminderSeconds: 45,
      shippingAwareEnabled: true,
      shippingFlatCost: 40,
      freeShippingThreshold: 1000,
      paymentAwareEnabled: true,
      prepaidIncentivePercent: 5,
      bundleNegotiationEnabled: true,
      bundleDiscountPercent: 10,
      emergencyPaused: false,
      aiPaused: true,
      dealFollowupEnabled: true,
      dealFollowupDelaysMinutes: [15, 180],
      dealFollowupMax: 2,
      trendIntelligenceEnabled: true,
      trendRegion: 'IN',
      trendTopics: ['fitness', 'gaming'],
      trendExcludedTopics: ['wellness', 'public_events'],
      trendHumorEnabled: true,
    }

    const res = await PUT(request(body))

    expect(res.status).toBe(200)
    expect(db.bargainConfig.upsert).toHaveBeenCalledTimes(1)
    const args = db.bargainConfig.upsert.mock.calls[0][0]
    expect(args.create).toMatchObject({ storeId: 'store-1' })
    expect(args.update).toMatchObject({
      ...body,
      goalStartTime: new Date(body.goalStartTime),
      goalEndTime: new Date(body.goalEndTime),
    })
  })

  it('rejects unknown trend topics and keeps the merchant write unchanged', async () => {
    const res = await PUT(request({ trendIntelligenceEnabled: true, trendTopics: ['politics', 'made_up'] }))

    expect(res.status).toBe(400)
    expect(db.bargainConfig.upsert).not.toHaveBeenCalled()
  })

  it('limits curated trend topics to eight and excluded topics to the full catalog', async () => {
    const res = await PUT(request({
      trendIntelligenceEnabled: true,
      trendTopics: [
        'fitness', 'music', 'gaming', 'bollywood', 'festivals', 'seasonal', 'photography', 'travel',
        'public_events', 'pets',
      ],
    }))

    expect(res.status).toBe(400)
    expect(db.bargainConfig.upsert).not.toHaveBeenCalled()
  })
})
