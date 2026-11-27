jest.mock('@/lib/shopify', () => ({ getAccessToken: jest.fn(async () => 'token') }))
jest.mock('@/lib/shopify-graphql', () => ({ queryShopifyGraphQL: jest.fn(async () => ({})) }))

import { buildBasicCodeDiscount } from '../discount'

describe('buildBasicCodeDiscount', () => {
  it('blocks product and order discount stacking while binding the subtotal', () => {
    const built = buildBasicCodeDiscount({
      store: {},
      code: 'BARGAIN-TEST',
      title: 'Bargain',
      value: { kind: 'percentage', percentage: 15 },
      target: { scope: 'product', productGids: ['gid://shopify/Product/1'] },
      minimumSubtotal: 850,
    }) as any

    expect(built.combinesWith).toEqual({
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false,
    })
    expect(built.minimumRequirement).toEqual({
      subtotal: { greaterThanOrEqualToSubtotal: '850.00' },
    })
    expect(built.customerGets.items).toEqual({
      products: { productsToAdd: ['gid://shopify/Product/1'] },
    })
  })
})
