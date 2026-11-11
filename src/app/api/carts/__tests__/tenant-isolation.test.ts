/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/carts/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn(), findUnique: jest.fn() },
    cart: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    analytics: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/auth-context', () => ({
  authenticate: jest.fn(),
  hasPermission: jest.fn(),
}))

import prisma from '@/lib/db'
import { authenticate, hasPermission } from '@/lib/auth-context'

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock; findUnique: jest.Mock }
  cart: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock }
  analytics: { upsert: jest.Mock }
}
const authMock = authenticate as jest.Mock
const permissionMock = hasPermission as jest.Mock

const OWNER = { userId: 'user-a' }
const OTHER = { userId: 'user-b' }

const VALID_CART = {
  storeId: 'store-b',
  cartId: 'shopify_cart_1',
  items: [{ title: 'Sneaker', quantity: 1, price: 100 }],
  totalValue: 100,
  currency: 'INR',
}

function getReq(query = '') {
  return new NextRequest(`https://cart-gain.com/api/carts${query}`, { method: 'GET' })
}

function postReq(body: unknown) {
  return new NextRequest('https://cart-gain.com/api/carts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  authMock.mockResolvedValue({ success: true, ctx: { userId: OWNER.userId } })
  permissionMock.mockReturnValue(true)
})

describe('tenant isolation — GET /api/carts', () => {
  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' })
    const res = await GET(getReq('?storeId=store-b'))
    expect(res.status).toBe(401)
    expect(prismaMock.cart.findMany).not.toHaveBeenCalled()
  })

  it('does not leak another merchant\'s carts when storeId is guessed', async () => {
    // Store belongs to user-b, but the caller is user-a → ownership lookup fails.
    prismaMock.store.findFirst.mockResolvedValue(null)

    const res = await GET(getReq('?storeId=store-b'))
    expect(res.status).toBe(404)
    // The ownership check must run before any cart is read.
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-b', userId: OWNER.userId },
    })
    expect(prismaMock.cart.findMany).not.toHaveBeenCalled()
  })

  it('returns carts for the caller\'s own store', async () => {
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store-a', userId: OWNER.userId })
    prismaMock.cart.findMany.mockResolvedValue([{ id: 'cart-1' }])

    const res = await GET(getReq('?storeId=store-a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.carts).toEqual([{ id: 'cart-1' }])
    expect(prismaMock.cart.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 'store-a' } })
    )
  })
})

describe('tenant isolation — POST /api/carts', () => {
  it('rejects unauthenticated writes', async () => {
    authMock.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' })
    const res = await POST(postReq(VALID_CART))
    expect(res.status).toBe(401)
    expect(prismaMock.cart.upsert).not.toHaveBeenCalled()
  })

  it('rejects read-only API keys', async () => {
    permissionMock.mockReturnValue(false)
    const res = await POST(postReq(VALID_CART))
    expect(res.status).toBe(403)
    expect(prismaMock.cart.upsert).not.toHaveBeenCalled()
  })

  it('refuses to write a cart into another merchant\'s store', async () => {
    // Store exists but is owned by user-b.
    prismaMock.store.findUnique.mockResolvedValue({ id: 'store-b', userId: OTHER.userId })

    const res = await POST(postReq(VALID_CART))
    expect(res.status).toBe(404)
    expect(prismaMock.cart.upsert).not.toHaveBeenCalled()
    expect(prismaMock.analytics.upsert).not.toHaveBeenCalled()
  })

  it('writes a cart into the caller\'s own store', async () => {
    prismaMock.store.findUnique.mockResolvedValue({ id: 'store-a', userId: OWNER.userId })
    prismaMock.cart.findUnique.mockResolvedValue(null)
    prismaMock.cart.upsert.mockResolvedValue({ id: 'cart-1', storeId: 'store-a' })
    prismaMock.analytics.upsert.mockResolvedValue({})

    const res = await POST(postReq({ ...VALID_CART, storeId: 'store-a' }))
    expect(res.status).toBe(201)
    expect(prismaMock.cart.upsert).toHaveBeenCalled()
  })
})
