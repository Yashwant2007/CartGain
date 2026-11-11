/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/bargain/products/route'
import { NextRequest } from 'next/server'

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainProduct: { findMany: jest.fn(), upsert: jest.fn() },
  },
}))

import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainProduct: { findMany: jest.Mock; upsert: jest.Mock }
}
const authMock = getServerSession as jest.Mock

function getReq(storeId?: string) {
  const q = storeId ? `?storeId=${storeId}` : ''
  return new NextRequest(`https://cart-gain.com/api/bargain/products${q}`, { method: 'GET' })
}

function postReq(body: unknown) {
  return new NextRequest('https://cart-gain.com/api/bargain/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-a' } })
})

describe('GET /api/bargain/products', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(getReq('store-a'))).status).toBe(401)
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
  })

  it('does not list another merchant\'s product rules', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await GET(getReq('store-b'))
    expect(res.status).toBe(404)
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-b', userId: 'user-a' },
    })
    expect(prismaMock.bargainProduct.findMany).not.toHaveBeenCalled()
  })

  it('lists its own product rules', async () => {
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store-a' })
    prismaMock.bargainProduct.findMany.mockResolvedValue([{ id: 'p1' }])
    const res = await GET(getReq('store-a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.products).toEqual([{ id: 'p1' }])
  })
})

describe('POST /api/bargain/products', () => {
  it('refuses to write a product rule into another merchant\'s store', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await POST(postReq({ storeId: 'store-b', shopifyProductId: 'gid://shopify/Product/1' }))
    expect(res.status).toBe(404)
    expect(prismaMock.bargainProduct.upsert).not.toHaveBeenCalled()
  })
})
