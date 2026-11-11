/**
 * @jest-environment node
 */
import { GET } from '@/app/api/merchant/bargain-experience/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainExperiencePublish: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/bargain/experience/config', () => ({
  getExperienceConfig: jest.fn(),
  sanitizeExperience: jest.fn((v: unknown) => v),
  defaultsUpdate: jest.fn(),
  experienceMirror: jest.fn(),
  fromDb: jest.fn(),
  toDbUpdate: jest.fn(),
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { getExperienceConfig } from '@/lib/bargain/experience/config'

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainExperiencePublish: { findMany: jest.Mock }
}
const authMock = getServerSession as jest.Mock
const getConfigMock = getExperienceConfig as jest.Mock

function req(storeId?: string) {
  const q = storeId ? `?storeId=${storeId}` : ''
  return new NextRequest(`https://cart-gain.com/api/merchant/bargain-experience${q}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-a' } })
  getConfigMock.mockResolvedValue({ config: { enabled: false } })
  prismaMock.bargainExperiencePublish.findMany.mockResolvedValue([])
})

describe('bargain experience tenant isolation', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(req('store-a'))).status).toBe(401)
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
  })

  it('never reads another merchant\'s store when a foreign storeId is supplied', async () => {
    // First lookup (id + userId) fails for user-a; the route falls back to the
    // caller's own first store. It must never load the foreign store's config.
    prismaMock.store.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'store-a', userId: 'user-a' })

    const res = await GET(req('store-b'))
    expect(res.status).toBe(200)
    expect(getConfigMock).toHaveBeenCalledWith('store-a', 'draft')
    expect(getConfigMock).not.toHaveBeenCalledWith('store-b', 'draft')
  })
})
