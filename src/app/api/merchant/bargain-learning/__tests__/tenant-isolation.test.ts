/**
 * @jest-environment node
 */
import { GET } from '@/app/api/merchant/bargain-learning/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainLearningConfig: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}))
jest.mock('@/lib/bargain/learning/service', () => ({
  loadLearningConfig: jest.fn(),
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { loadLearningConfig } from '@/lib/bargain/learning/service'

const prismaMock = prisma as unknown as { store: { findFirst: jest.Mock } }
const authMock = getServerSession as jest.Mock
const loadMock = loadLearningConfig as jest.Mock

function req(storeId?: string) {
  const q = storeId ? `?storeId=${storeId}` : ''
  return new NextRequest(`https://cart-gain.com/api/merchant/bargain-learning${q}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-a' } })
})

describe('bargain learning tenant isolation', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(req('store-a'))).status).toBe(401)
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
  })

  it('does not read another merchant\'s learning config', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await GET(req('store-b'))
    expect(res.status).toBe(404)
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-b', userId: 'user-a' },
      select: { id: true },
    })
    expect(loadMock).not.toHaveBeenCalled()
  })
})
