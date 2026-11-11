/**
 * @jest-environment node
 */
import { GET } from '@/app/api/analytics/overview/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn(), findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock; findUnique: jest.Mock }
  $queryRaw: jest.Mock
}
const authMock = getServerSession as jest.Mock

function req(query = '?storeId=store-b&days=30') {
  return new NextRequest(`https://cart-gain.com/api/analytics/overview${query}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-a' } })
})

describe('analytics overview tenant isolation', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    expect(prismaMock.store.findUnique).not.toHaveBeenCalled()
  })

  it('does not compute analytics for another merchant\'s store', async () => {
    prismaMock.store.findUnique.mockResolvedValue({ id: 'store-b', userId: 'user-b' })
    const res = await GET(req('?storeId=store-b&days=30'))
    expect(res.status).toBe(404)
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  })

  it('rejects an invalid days window before touching data', async () => {
    const res = await GET(req('?storeId=store-a&days=9999'))
    expect(res.status).toBe(400)
    expect(prismaMock.store.findUnique).not.toHaveBeenCalled()
  })
})
