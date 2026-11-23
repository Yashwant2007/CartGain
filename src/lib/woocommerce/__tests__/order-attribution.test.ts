jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('@/lib/bargain/goals', () => ({
  attributeBargainGoal: jest.fn(async () => undefined),
  netBargainGoalRefund: jest.fn(async () => undefined),
}))

jest.mock('@/lib/bargain/learning/outcomes', () => ({
  recordLearningRefund: jest.fn(async () => undefined),
}))

jest.mock('@/lib/bargain/purchase', () => ({
  attributeBargainPurchase: jest.fn(async () => undefined),
  rememberConfirmedOrder: jest.fn(async () => undefined),
  netBargainPurchaseRefund: jest.fn(async () => undefined),
}))

jest.mock('@/lib/bargain/quote', () => ({
  findQuoteByDiscountCode: jest.fn(),
  redeemQuote: jest.fn(async () => undefined),
}))

jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(async () => undefined),
}))

jest.mock('@/lib/payment', () => ({
  ATTRIBUTION_WINDOW_HOURS: 72,
  FREE_CARTS_THRESHOLD: 50,
  getPlan: jest.fn(() => null),
  resolvePlanId: jest.fn(() => 'free'),
}))

import { attributeBargainGoal } from '@/lib/bargain/goals'
import { rememberConfirmedOrder, attributeBargainPurchase } from '@/lib/bargain/purchase'
import { findQuoteByDiscountCode, redeemQuote } from '@/lib/bargain/quote'
import { attributeWooBargainOrder } from '../order-attribution'

const mockFindQuote = findQuoteByDiscountCode as jest.Mock

const store = {
  id: 'store-1',
  userId: 'user-1',
  domain: 'shop.example.com',
  timezone: 'Asia/Kolkata',
}

const order = {
  platformOrderId: '9001',
  cartId: 'wc-cart-token',
  externalCustomerId: '9',
  status: 'completed',
  currency: 'INR',
  total: 180,
  subtotal: 200,
  discountTotal: 20,
  customerEmail: 'ada@example.com',
  customerPhone: '+919876543210',
  customerName: 'Ada Lovelace',
  couponCodes: ['GAIN123'],
  items: [
    {
      productId: '42',
      variationId: '43',
      name: 'Trail Shoe',
      price: 180,
      quantity: 1,
      imageUrl: 'https://shop.example.com/shoe.png',
    },
  ],
  placedAt: new Date('2026-01-02T03:04:05.000Z'),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindQuote.mockResolvedValue({
    id: 'quote-1',
    status: 'ISSUED',
    orderId: null,
    storeId: store.id,
  })
})

describe('WooCommerce bargain attribution', () => {
  it('uses prefixed order ids and redeems issued coupons', async () => {
    await attributeWooBargainOrder(store, order)

    expect(rememberConfirmedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: store.id,
        shopifyOrderId: 'woo:9001',
        cartToken: 'wc-cart-token',
        appliedCodes: ['GAIN123'],
        lineItems: [expect.objectContaining({ product_id: '42', variant_id: '43' })],
      }),
    )
    expect(attributeBargainGoal).toHaveBeenCalledWith(
      expect.objectContaining({ shopifyOrderId: 'woo:9001', orderAmount: 180 }),
    )
    expect(attributeBargainPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ shopifyOrderId: 'woo:9001', orderAmount: 180 }),
    )
    expect(redeemQuote).toHaveBeenCalledWith(
      expect.objectContaining({ quote: expect.objectContaining({ id: 'quote-1' }), orderId: 'woo:9001' }),
    )
  })
})
