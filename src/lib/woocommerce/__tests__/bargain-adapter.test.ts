jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    platformProduct: { findMany: jest.fn() },
    bargainProduct: { findFirst: jest.fn(), findUnique: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    store: { findUnique: jest.fn(), findFirst: jest.fn() },
  },
}))

jest.mock('@/lib/woocommerce/service', () => ({
  getWooConnectionBundle: jest.fn(),
  createWooCouponForStore: jest.fn(),
}))

import prisma from '@/lib/db'
import { createWooCouponForStore, getWooConnectionBundle } from '@/lib/woocommerce/service'
import {
  bargainPlatformFor,
  buildWooCommerceCheckoutUrl,
  createOrReuseWooCommerceCoupon,
  findBargainProductOverride,
  getWooCommerceCredentials,
  isWooCommerce,
  listWooCommerceRecommendationProducts,
  platformProductId,
  platformProductPrice,
  wooProductUrl,
} from '../bargain-adapter'

const mockPrisma = prisma as any
const bundleMock = getWooConnectionBundle as jest.Mock
const couponMock = createWooCouponForStore as jest.Mock

const store = {
  id: 'store-1',
  domain: 'shop.example.com',
  platform: 'woocommerce',
  isActive: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  bundleMock.mockResolvedValue({
    config: {
      storeId: store.id,
      storeUrl: 'https://shop.example.com',
      credentials: { key: 'ck_test', secret: 'cs_test' },
      webhookSecret: 'whsec_test',
      connectionId: 'conn-1',
    },
  })
  couponMock.mockResolvedValue({ code: 'GAIN123', status: 'created', verified: true })
})

describe('WooCommerce bargain adapter helpers', () => {
  it('detects the WooCommerce platform and keeps Shopify as the default', () => {
    expect(isWooCommerce('WooCommerce')).toBe(true)
    expect(isWooCommerce('shopify')).toBe(false)
    expect(bargainPlatformFor({ platform: 'woocommerce' })).toBe('woocommerce')
    expect(bargainPlatformFor({ platform: 'shopify' }, 'woocommerce')).toBe('woocommerce')
    expect(bargainPlatformFor({ platform: 'shopify' })).toBe('shopify')
  })

  it('reads generic product identifiers and prices', () => {
    const row = {
      platformProductId: 'woo-42',
      salePrice: 18.5,
      regularPrice: 25,
    }
    expect(platformProductId(row)).toBe('woo-42')
    expect(platformProductPrice(row)).toBe(18.5)
  })

  it('builds a cart checkout URL with the coupon and negotiated product applied', () => {
    expect(buildWooCommerceCheckoutUrl({ domain: 'https://shop.example.com/', code: 'GAIN123' }))
      .toBe('https://shop.example.com/cart/?coupon_code=GAIN123')
    expect(buildWooCommerceCheckoutUrl({ domain: 'https://shop.example.com/', code: 'GAIN123', productId: 'woo-42' }))
      .toBe('https://shop.example.com/cart/?coupon_code=GAIN123&product_id=42')
    expect(buildWooCommerceCheckoutUrl({ domain: 'https://shop.example.com/', code: 'GAIN123', productId: '42', variantId: '77' }))
      .toBe('https://shop.example.com/cart/?coupon_code=GAIN123&product_id=77')
  })

  it('builds WooCommerce product URLs with the shop permalink shape', () => {
    expect(wooProductUrl({ slug: 'trail-boots' }, store, '42'))
      .toBe('https://shop.example.com/product/trail-boots')
    expect(wooProductUrl({ permalink: 'https://evil.test/product/trail-boots', slug: 'trail-boots' }, store, '42'))
      .toBe('https://shop.example.com/product/trail-boots')
  })

  it('lists WooCommerce catalog rows with shop-domain product links', async () => {
    mockPrisma.platformProduct.findMany.mockResolvedValue([{
      platformProductId: 'woo-42',
      title: 'Trail Boots',
      salePrice: 80,
      regularPrice: 100,
      slug: 'trail-boots',
      status: 'publish',
    }])
    const products = await listWooCommerceRecommendationProducts(store.id, store)
    expect(products).toHaveLength(1)
    expect(products[0]).toEqual(expect.objectContaining({
      title: 'Trail Boots',
      productUrl: 'https://shop.example.com/product/trail-boots',
    }))
  })

  it('uses decrypted connection credentials', async () => {
    await expect(getWooCommerceCredentials(store)).resolves.toEqual({
      baseUrl: 'https://shop.example.com',
      key: 'ck_test',
      secret: 'cs_test',
    })
  })

  it('looks up generic bargain overrides by platform product id', async () => {
    const override = { id: 'override-1', minPrice: 70 }
    mockPrisma.bargainProduct.findFirst.mockResolvedValue(override)
    await expect(findBargainProductOverride(store.id, 'woo-42', 'woocommerce')).resolves.toBe(override)
    expect(mockPrisma.bargainProduct.findFirst).toHaveBeenCalledWith({
      where: { storeId: store.id, platformProductId: 'woo-42' },
    })
  })

  it('creates a verified WooCommerce coupon through the platform adapter', async () => {
    await expect(createOrReuseWooCommerceCoupon({
      store,
      code: 'GAIN123',
      value: 15,
      type: 'percentage',
      minimumSubtotal: 100,
    })).resolves.toEqual({
      code: 'GAIN123',
      status: 'created',
      purchaseUrl: 'https://shop.example.com/cart/?coupon_code=GAIN123',
    })
    expect(couponMock).toHaveBeenCalledWith(store.id, expect.objectContaining({
      code: 'GAIN123',
      type: 'percentage',
      value: 15,
      usageLimit: 1,
    }))
  })

  it('maps an existing coupon to the reused status', async () => {
    couponMock.mockResolvedValue({ code: 'GAIN123', status: 'existing', verified: true })
    await expect(createOrReuseWooCommerceCoupon({
      store,
      code: 'GAIN123',
      value: 15,
      type: 'percentage',
    })).resolves.toEqual(expect.objectContaining({ status: 'reused' }))
  })

  it('returns null when the coupon cannot be verified', async () => {
    couponMock.mockResolvedValue({ code: 'GAIN123', status: 'failed', verified: false })
    await expect(createOrReuseWooCommerceCoupon({
      store,
      code: 'GAIN123',
      value: 15,
      type: 'percentage',
    })).resolves.toBeNull()
  })
})
