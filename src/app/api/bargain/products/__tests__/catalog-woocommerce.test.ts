/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'

const mockPrisma: any = {
  store: { findFirst: jest.fn() },
  bargainProduct: { findMany: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn() }))
jest.mock('@/lib/woocommerce/bargain-adapter', () => ({
  hasActiveWooCommerceConnection: jest.fn(),
  listPlatformProducts: jest.fn(),
  platformProductId: jest.fn((row: any) => row?.platformProductId ?? row?.shopifyProductId ?? null),
  platformProductPrice: jest.fn((row: any) => row?.price ?? row?.salePrice ?? row?.regularPrice ?? null),
  platformProductVariantId: jest.fn((row: any) => row?.variantId ?? row?.platformVariantId ?? row?.id ?? null),
  productField: jest.fn((row: any, keys: string[]) => {
    for (const key of keys) {
      if (row?.[key] != null) return row[key]
    }
    return undefined
  }),
}))

import { fetchShopifyProducts } from '@/lib/shopify'
import {
  hasActiveWooCommerceConnection,
  listPlatformProducts,
} from '@/lib/woocommerce/bargain-adapter'
import { GET as catalogGET } from '../catalog/route'

const store = {
  id: 'store-1',
  userId: 'user-1',
  platform: 'woocommerce',
  domain: 'shop.example.com',
}

const override = {
  id: 'override-1',
  storeId: 'store-1',
  shopifyProductId: 'woo-1',
  platformProductId: 'woo-1',
  productTitle: 'Woo Snowboard',
  minPrice: 40,
  maxDiscountPercent: 25,
  isBargainable: false,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
  mockPrisma.store.findFirst.mockResolvedValue(store)
  mockPrisma.bargainProduct.findMany.mockResolvedValue([override])
  ;(hasActiveWooCommerceConnection as jest.Mock).mockResolvedValue(true)
  ;(listPlatformProducts as jest.Mock).mockResolvedValue([
    {
      platformProductId: 'woo-1',
      name: 'Woo Snowboard',
      status: 'publish',
      price: 80,
      regularPrice: 100,
      imageUrl: 'https://shop.example.com/snowboard.jpg',
    },
    {
      platformProductId: 'woo-2',
      name: 'Woo Boots',
      status: 'publish',
      price: 50,
    },
  ])
})

describe('/api/bargain/products/catalog for WooCommerce', () => {
  it('merges generic platform products with saved bargain overrides', async () => {
    const res = await catalogGET(new NextRequest('http://localhost/api/bargain/products/catalog?storeId=store-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.platform).toBe('woocommerce')
    expect(body.products).toHaveLength(2)
    expect(body.products[0].product).toEqual(expect.objectContaining({
      id: 'woo-1',
      title: 'Woo Snowboard',
      status: 'publish',
      image: { src: 'https://shop.example.com/snowboard.jpg' },
    }))
    expect(body.products[0].product.variants[0]).toEqual(expect.objectContaining({
      id: 'woo-1',
      price: '80',
    }))
    expect(body.products[0].bargains).toEqual({
      overrideId: 'override-1',
      enabled: false,
      minPrice: 40,
      maxDiscountPercent: 25,
    })
    expect(body.products[1].bargains.enabled).toBe(true)
    expect(fetchShopifyProducts).not.toHaveBeenCalled()
  })

  it('filters generic products by id or title', async () => {
    const res = await catalogGET(new NextRequest('http://localhost/api/bargain/products/catalog?storeId=store-1&q=boots'))
    const body = await res.json()

    expect(body.products).toHaveLength(1)
    expect(body.products[0].product.id).toBe('woo-2')
  })

  it('rejects a store without an active WooCommerce connection', async () => {
    ;(hasActiveWooCommerceConnection as jest.Mock).mockResolvedValue(false)
    const res = await catalogGET(new NextRequest('http://localhost/api/bargain/products/catalog?storeId=store-1'))
    expect(res.status).toBe(404)
  })
})
