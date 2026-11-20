jest.mock('@/lib/shopify/discount', () => ({
  createShopifyDiscountCode: jest.fn(),
}))

jest.mock('@/lib/woocommerce/recovery-offer', () => ({
  resolveWooCommerceRecoveryCoupon: jest.fn(),
}))

import { createShopifyDiscountCode } from '@/lib/shopify/discount'
import { resolveWooCommerceRecoveryCoupon } from '@/lib/woocommerce/recovery-offer'
import { buildRecoveryCode, resolveRecoveryOffer } from '@/lib/recovery/offer'

const shopifyMock = createShopifyDiscountCode as jest.Mock
const wooMock = resolveWooCommerceRecoveryCoupon as jest.Mock

const store = {
  id: 'store-1',
  domain: 'shop.example.com',
  apiKey: null,
  shopifyRefreshToken: null,
  shopifyTokenExpiresAt: null,
  platform: 'woocommerce',
} as any

const campaign = {
  discountEnabled: true,
  discountType: 'percentage',
  discountValue: 12,
  discountCode: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  wooMock.mockResolvedValue({
    code: 'GAINABC123',
    source: 'minted',
    purchaseUrl: 'https://shop.example.com/cart/?coupon_code=GAINABC123',
  })
  shopifyMock.mockResolvedValue({ status: 'created', verified: true })
})

describe('recovery offers on WooCommerce stores', () => {
  it('uses the WooCommerce coupon path when the store platform is WooCommerce', async () => {
    await expect(resolveRecoveryOffer({
      store,
      cartId: 'cart-1',
      campaign,
      cartTotal: 250,
    })).resolves.toEqual({
      code: 'GAINABC123',
      value: 12,
      type: 'percentage',
      source: 'minted',
    })
    expect(wooMock).toHaveBeenCalledWith(expect.objectContaining({
      code: buildRecoveryCode('cart-1'),
      value: 12,
      type: 'percentage',
      cartTotal: 250,
      cartId: 'cart-1',
    }))
    expect(shopifyMock).not.toHaveBeenCalled()
  })

  it('honours an explicit WooCommerce platform for Shopify-shaped callers', async () => {
    await expect(resolveRecoveryOffer({
      store: { ...store, platform: 'shopify' },
      cartId: 'cart-2',
      campaign,
      platform: 'woocommerce',
    })).resolves.toEqual(expect.objectContaining({ code: 'GAINABC123' }))
    expect(wooMock).toHaveBeenCalled()
    expect(shopifyMock).not.toHaveBeenCalled()
  })

  it('returns no offer when WooCommerce coupon creation fails', async () => {
    wooMock.mockResolvedValue(null)
    await expect(resolveRecoveryOffer({
      store,
      cartId: 'cart-3',
      campaign,
    })).resolves.toBeNull()
    expect(shopifyMock).not.toHaveBeenCalled()
  })
})
