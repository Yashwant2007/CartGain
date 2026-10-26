/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'

const mockPrisma: any = {
  store: { findFirst: jest.fn() },
  bargainLearningConfig: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  bargainLearningArmStat: { findMany: jest.fn() },
  bargainLearningEvent: { count: jest.fn() },
  bargainLearningOutcome: { count: jest.fn() },
  bargainLearningAudit: { create: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))

import { DELETE, GET, POST } from '../route'

const configRow = {
  enabled: true,
  shadowMode: true,
  demoEnabled: true,
  version: 'v1',
  explorationRate: 0.15,
  minSamplesPerArm: 30,
  attributionWindowDays: 7,
  eventRetentionDays: 180,
  rewardConversion: 0.4,
  rewardMargin: 0.3,
  rewardExperience: 0.2,
  rewardEfficiency: 0.1,
  allowedStrategies: [],
  blockedStrategies: [],
  promoStrategyEnabled: false,
}

function request(method = 'GET', body?: unknown) {
  return new NextRequest('http://localhost/api/merchant/bargain-learning?storeId=store-1', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })
}

describe('/api/merchant/bargain-learning', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
    mockPrisma.store.findFirst.mockResolvedValue({ id: 'store-1' })
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(null)
    mockPrisma.bargainLearningConfig.upsert.mockResolvedValue({ id: 'config-1', ...configRow })
    mockPrisma.bargainLearningConfig.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.bargainLearningArmStat.findMany.mockResolvedValue([])
    mockPrisma.bargainLearningEvent.count.mockResolvedValue(0)
    mockPrisma.bargainLearningOutcome.count.mockResolvedValue(0)
    mockPrisma.bargainLearningAudit.create.mockResolvedValue({})
  })

  test('requires a signed-in merchant', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    const res = await GET(request())
    expect(res.status).toBe(401)
  })

  test('scopes the config to a store the merchant owns', async () => {
    mockPrisma.store.findFirst.mockResolvedValue(null)
    const res = await GET(request())
    expect(res.status).toBe(404)
    expect(mockPrisma.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-1', userId: 'user-1' },
      select: { id: true },
    })
  })

  test('returns resolved defaults when the store has no config', async () => {
    const res = await GET(request())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.configured).toBe(false)
    expect(body.mode).toBe('baseline')
    expect(body.enabled).toBe(false)
    expect(body.shadowMode).toBe(true)
    expect(body.rewardConversion).toBe(0.4)
  })

  test('reports the resolved mode and aggregated evidence', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow)
    mockPrisma.bargainLearningEvent.count.mockResolvedValue(12)
    mockPrisma.bargainLearningOutcome.count.mockResolvedValue(4)
    const res = await GET(request())
    const body = await res.json()
    expect(body.configured).toBe(true)
    expect(body.mode).toBe('shadow')
    expect(body.totalEvents).toBe(12)
    expect(body.totalOutcomes).toBe(4)
  })

  test('saves a validated config and writes an audit row', async () => {
    const res = await POST(
      request('POST', {
        enabled: true,
        shadowMode: false,
        demoEnabled: true,
        version: 'v2',
        explorationRate: 0.1,
        minSamplesPerArm: 20,
        attributionWindowDays: 14,
        eventRetentionDays: 90,
        rewardConversion: 0.5,
        rewardMargin: 0.25,
        rewardExperience: 0.15,
        rewardEfficiency: 0.1,
        allowedStrategies: ['CONCISE', 'FRIENDLY'],
        blockedStrategies: ['FIRM'],
        promoStrategyEnabled: false,
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.configured).toBe(true)
    expect(body.version).toBe('v2')
    expect(mockPrisma.bargainLearningConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 'store-1' },
        update: expect.objectContaining({ enabled: true, shadowMode: false }),
      }),
    )
    expect(mockPrisma.bargainLearningAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 'store-1',
          action: 'enable',
          resourceType: 'bargain_learning_config',
        }),
      }),
    )
  })

  test('rejects unsafe exploration rates', async () => {
    const res = await POST(request('POST', { explorationRate: 0.9 }))
    expect(res.status).toBe(400)
    expect(mockPrisma.bargainLearningConfig.upsert).not.toHaveBeenCalled()
  })

  test('rejects unsupported strategies', async () => {
    const res = await POST(request('POST', { allowedStrategies: ['MAGIC'] }))
    expect(res.status).toBe(400)
  })

  test('rejects an invalid version', async () => {
    const res = await POST(request('POST', { version: 'bad version!' }))
    expect(res.status).toBe(400)
  })

  test('rejects all-zero reward weights', async () => {
    const res = await POST(
      request('POST', {
        rewardConversion: 0,
        rewardMargin: 0,
        rewardExperience: 0,
        rewardEfficiency: 0,
      }),
    )
    expect(res.status).toBe(400)
  })

  test('reset removes only the store config', async () => {
    const res = await DELETE(request('DELETE'))
    expect(res.status).toBe(200)
    expect(mockPrisma.bargainLearningConfig.deleteMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
    })
  })
})
