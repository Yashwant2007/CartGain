jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainConfig: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/woocommerce/bargain-adapter', () => ({
  findBargainProductOverride: jest.fn(),
  isWooCommerce: jest.fn((value: unknown) => typeof value === 'string' && value.toLowerCase() === 'woocommerce'),
}))

import prisma from '@/lib/db'
import { findBargainProductOverride } from '@/lib/woocommerce/bargain-adapter'
import { computeMinPrice } from '@/lib/services/bargain'

const mockPrisma = prisma as any
const overrideMock = findBargainProductOverride as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.bargainConfig.findUnique.mockResolvedValue({ enabled: true, minProfitPercent: 20 })
})

describe('generic bargain floor lookup', () => {
  it('uses the generic platform floor for WooCommerce products', async () => {
    overrideMock.mockResolvedValue({ minPrice: 65, isBargainable: true })
    await expect(computeMinPrice({
      storeId: 'store-1',
      shopifyProductId: 'legacy-id',
      platformProductId: 'woo-42',
      platform: 'woocommerce',
      originalPrice: 100,
    })).resolves.toEqual({ minPrice: 65, isBargainable: true })
    expect(overrideMock).toHaveBeenCalledWith('store-1', 'woo-42', 'woocommerce')
  })

  it('keeps the Shopify shopifyProductId lookup unchanged', async () => {
    overrideMock.mockResolvedValue({ minPrice: 72, isBargainable: true })
    await expect(computeMinPrice({
      storeId: 'store-1',
      shopifyProductId: 'shopify-42',
      platformProductId: 'woo-42',
      originalPrice: 100,
    })).resolves.toEqual({ minPrice: 72, isBargainable: true })
    expect(overrideMock).toHaveBeenCalledWith('store-1', 'shopify-42', 'shopify')
  })

  it('blocks bargaining from a generic disabled override', async () => {
    overrideMock.mockResolvedValue({ isBargainable: false })
    await expect(computeMinPrice({
      storeId: 'store-1',
      shopifyProductId: 'legacy-id',
      platformProductId: 'woo-42',
      platform: 'woocommerce',
      originalPrice: 100,
    })).resolves.toEqual({
      minPrice: 100,
      isBargainable: false,
      reason: 'product_not_bargainable',
    })
  })
})
