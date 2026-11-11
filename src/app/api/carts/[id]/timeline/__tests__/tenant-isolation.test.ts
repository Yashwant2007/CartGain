/**
 * @jest-environment node
 */
import { GET } from '@/app/api/carts/[id]/timeline/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    cart: { findFirst: jest.fn() },
    campaign: { findFirst: jest.fn() },
    customerIdentity: { findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/auth-context', () => ({ authenticate: jest.fn() }))

import prisma from '@/lib/db'
import { authenticate } from '@/lib/auth-context'

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  cart: { findFirst: jest.Mock }
}
const authMock = authenticate as jest.Mock

function req(storeId?: string) {
  const q = storeId ? `?storeId=${storeId}` : ''
  return new NextRequest(`https://cart-gain.com/api/carts/cart-x/timeline${q}`, { method: 'GET' })
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ success: true, ctx: { userId: 'user-a' } })
})

describe('cart timeline tenant isolation', () => {
  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' })
    expect((await GET(req('store-a'), { params: { id: 'cart-x' } })).status).toBe(401)
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled()
  })

  it('requires a storeId', async () => {
    expect((await GET(req(), { params: { id: 'cart-x' } })).status).toBe(400)
  })

  it('does not open a timeline for another merchant\'s store', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)
    const res = await GET(req('store-b'), { params: { id: 'cart-x' } })
    expect(res.status).toBe(404)
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-b', userId: 'user-a' },
      select: { id: true },
    })
    expect(prismaMock.cart.findFirst).not.toHaveBeenCalled()
  })

  it('does not return a cart that belongs to another store', async () => {
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store-a' })
    // cart.findFirst is scoped by storeId, so another store's cart resolves to null.
    prismaMock.cart.findFirst.mockResolvedValue(null)
    const res = await GET(req('store-a'), { params: { id: 'cart-x' } })
    expect(res.status).toBe(404)
    expect(prismaMock.cart.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cart-x', storeId: 'store-a' } })
    )
  })
})
