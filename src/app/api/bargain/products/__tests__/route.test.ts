/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { fetchShopifyProducts } from '@/lib/shopify'

const mockPrisma: any = {
  store: { findFirst: jest.fn() },
  bargainProduct: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn() }))

import { GET as catalogGET } from '../catalog/route'
import { DELETE as productDELETE, POST as productPOST } from '../route'

const store = { id: 'store-1', userId: 'user-1', platform: 'shopify', domain: 'test.myshopify.com' }
const override = {
  id: 'override-1',
  storeId: 'store-1',
  shopifyProductId: '123',
  productTitle: 'Snowboard',
  minPrice: 20,
  minProfitPercent: null,
  maxDiscountPercent: 30,
  isBargainable: false,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
  mockPrisma.store.findFirst.mockResolvedValue(store)
  mockPrisma.bargainProduct.findMany.mockResolvedValue([override])
  mockPrisma.bargainProduct.findUnique.mockResolvedValue(override)
  mockPrisma.bargainProduct.delete.mockResolvedValue(override)
  mockPrisma.bargainProduct.upsert.mockResolvedValue(override)
  ;(fetchShopifyProducts as jest.Mock).mockResolvedValue({
    products: [{ id: 123, title: 'Snowboard', status: 'active', variants: [{ price: '24.95' }] }],
    nextCursor: 'next',
    prevCursor: null,
    error: null,
  })
})

describe('/api/bargain/products/catalog', () => {
  test('returns the override id and every saved rule for the product tab', async () => {
    const res = await catalogGET(new NextRequest('http://localhost/api/bargain/products/catalog?storeId=store-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.products[0].bargains).toEqual({
      overrideId: 'override-1',
      enabled: false,
      minPrice: 20,
      maxDiscountPercent: 30,
    })
    expect(body.savedOverrides).toEqual([
      expect.objectContaining({ id: 'override-1', shopifyProductId: '123', isBargainable: false }),
    ])
  })

  test('translates a bare product id into a Shopify id query', async () => {
    await catalogGET(new NextRequest('http://localhost/api/bargain/products/catalog?storeId=store-1&q=123'))

    expect(fetchShopifyProducts).toHaveBeenCalledWith(store, {
      pageInfo: null,
      query: 'id:123',
    })
  })
})

describe('POST /api/bargain/products', () => {
  test('clears per-product floors when the merchant blanks them', async () => {
    const res = await productPOST(
      new NextRequest('http://localhost/api/bargain/products', {
        method: 'POST',
        body: JSON.stringify({
          storeId: 'store-1',
          shopifyProductId: '123',
          productTitle: 'Snowboard',
          isBargainable: true,
          minPrice: null,
          maxDiscountPercent: null,
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(mockPrisma.bargainProduct.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ minPrice: null, maxDiscountPercent: null }),
    }))
  })
})

describe('DELETE /api/bargain/products', () => {
  test('resets by storeId + shopifyProductId from the catalog UI', async () => {
    const res = await productDELETE(
      new NextRequest('http://localhost/api/bargain/products?storeId=store-1&shopifyProductId=123', {
        method: 'DELETE',
      }),
    )

    expect(res.status).toBe(200)
    expect(mockPrisma.bargainProduct.findUnique).toHaveBeenCalledWith({
      where: { storeId_shopifyProductId: { storeId: 'store-1', shopifyProductId: '123' } },
    })
    expect(mockPrisma.bargainProduct.delete).toHaveBeenCalledWith({ where: { id: 'override-1' } })
  })

  test('still resets by override id for older links', async () => {
    const res = await productDELETE(
      new NextRequest('http://localhost/api/bargain/products?id=override-1', { method: 'DELETE' }),
    )

    expect(res.status).toBe(200)
    expect(mockPrisma.bargainProduct.findUnique).toHaveBeenCalledWith({ where: { id: 'override-1' } })
  })

  test('rejects a request without an override identifier', async () => {
    const res = await productDELETE(
      new NextRequest('http://localhost/api/bargain/products?storeId=store-1', { method: 'DELETE' }),
    )

    expect(res.status).toBe(400)
    expect(mockPrisma.bargainProduct.delete).not.toHaveBeenCalled()
  })
})

