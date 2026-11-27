import { GET } from '@/app/api/jobs/process-carts/route'
import prisma from '@/lib/db'
import { NextRequest } from 'next/server'

jest.mock('@/lib/job-auth', () => ({ requireJobAuth: jest.fn(async () => null) }))
jest.mock('@/lib/jobs/sweep-slot', () => ({ claimSweepSlot: jest.fn(async () => true) }))
jest.mock('@/lib/queue/init', () => ({ initializeQueues: jest.fn(async () => {}) }))
jest.mock('@/lib/redis', () => ({
  getRedis: jest.fn(() => null),
  redisGet: jest.fn(),
  redisSet: jest.fn(),
}))
jest.mock('@/lib/shopify', () => ({ syncAbandonedCheckouts: jest.fn(async () => 0) }))
jest.mock('@/lib/jobs/processAbandonedCarts', () => ({
  processAbandonedCarts: jest.fn(async () => ({})),
}))
jest.mock('@/lib/jobs/processBargainDealFollowups', () => ({
  processBargainDealFollowups: jest.fn(async () => ({})),
}))
jest.mock('@/lib/jobs/processRecoveryJourneys', () => ({
  processRecoveryJourneys: jest.fn(async () => ({})),
}))
jest.mock('@/lib/alerter', () => ({ sendAlertOnError: jest.fn() }))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: {
      findMany: jest.fn(),
    },
  },
}))

const findMany = prisma.store.findMany as jest.Mock

describe('process carts sweep store projection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findMany.mockResolvedValue([])
  })

  it('loads the persisted protected URL capability for checkout sync', async () => {
    const res = await GET(new NextRequest('https://cart-gain.com/api/jobs/process-carts'))

    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        abandonedCheckoutUrlAccess: true,
        abandonedCheckoutUrlCheckedAt: true,
      }),
    }))
  })
})
