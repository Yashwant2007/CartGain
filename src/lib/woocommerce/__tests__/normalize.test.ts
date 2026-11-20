import {
  mergeCartItems,
  normalizeCartEvent,
  normalizeCartItems,
  normalizeCustomer,
  normalizeOrderEvent,
  normalizeProduct,
} from '../normalize'

describe('WooCommerce normalization', () => {
  it('normalizes products and variations with pricing and inventory', () => {
    const { product, variations } = normalizeProduct(
      {
        id: 42,
        name: 'Trail Shoe',
        description: 'A shoe',
        regular_price: '100.00',
        sale_price: '80.00',
        stock_quantity: 7,
        stock_status: 'instock',
        status: 'publish',
        images: [{ src: 'https://shop.example.com/shoe.png' }],
        categories: [{ id: 9, name: 'Shoes' }],
      },
      [
        {
          id: 43,
          regular_price: '110',
          stock_quantity: 2,
          stock_status: 'instock',
          attributes: [{ name: 'Size', option: '9' }],
        },
      ],
    )

    expect(product).toMatchObject({
      platformProductId: '42',
      kind: 'product',
      name: 'Trail Shoe',
      regularPrice: 100,
      salePrice: 80,
      inventoryQuantity: 7,
      stockStatus: 'instock',
      imageUrl: 'https://shop.example.com/shoe.png',
    })
    expect(variations).toHaveLength(1)
    expect(variations[0]).toMatchObject({
      platformProductId: '42',
      platformVariantId: '43',
      variantKey: '43',
      kind: 'variation',
      inventoryQuantity: 2,
      stockStatus: 'instock',
    })
  })

  it('normalizes plugin-sent products with nested prices and variations', () => {
    const { product, variations } = normalizeProduct({
      id: 77,
      name: 'Camp Mug',
      prices: { price: '18', regularPrice: '22', salePrice: '18' },
      inventory: { stockQuantity: 12, stockStatus: 'instock' },
      images: [{ src: 'https://shop.example.com/mug.png' }],
      status: 'publish',
      variations: [
        {
          id: 78,
          parentId: 77,
          prices: { regularPrice: '25', salePrice: '20' },
          inventory: { stockQuantity: 3, stockStatus: 'instock' },
          image: 'https://shop.example.com/mug-blue.png',
        },
      ],
    })

    expect(product).toMatchObject({
      platformProductId: '77',
      regularPrice: 22,
      salePrice: 18,
      inventoryQuantity: 12,
      stockStatus: 'instock',
      imageUrl: 'https://shop.example.com/mug.png',
    })
    expect(variations).toHaveLength(1)
    expect(variations[0]).toMatchObject({
      platformProductId: '77',
      platformVariantId: '78',
      regularPrice: 25,
      salePrice: 20,
      inventoryQuantity: 3,
      imageUrl: 'https://shop.example.com/mug-blue.png',
    })
  })

  it('normalizes cart items and preserves inventory through a partial update', () => {
    const items = normalizeCartItems([
      {
        key: '42:43',
        product_id: 42,
        variation_id: 43,
        name: 'Trail Shoe',
        quantity: 1,
        price: '80.00',
        inventory_quantity: 2,
        stock_status: 'instock',
        image: { src: 'https://shop.example.com/shoe.png' },
      },
    ])

    expect(items[0]).toMatchObject({
      key: '42:43',
      productId: '42',
      variationId: '43',
      quantity: 1,
      price: 80,
      inventory: 2,
      stockStatus: 'instock',
      imageUrl: 'https://shop.example.com/shoe.png',
    })

    const merged = mergeCartItems(items, [{ key: '42:43', productId: '42', quantity: 2 }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ quantity: 2, inventory: 2, stockStatus: 'instock', price: 80 })
  })

  it('normalizes cart events with customer and currency', () => {
    const cart = normalizeCartEvent({
      cart: {
        token: 'wc-cart-token',
        total_price: '125.50',
        currency: 'USD',
        items: [{ product_id: 7, quantity: 1, price: '125.50' }],
        customer: { id: 5, email: 'buyer@example.com', first_name: 'Ada', last_name: 'Lovelace' },
      },
    })

    expect(cart).toMatchObject({
      cartId: 'wc-cart-token',
      total: 125.5,
      currency: 'USD',
      customer: { externalCustomerId: '5', email: 'buyer@example.com', name: 'Ada Lovelace' },
    })
    expect(normalizeCartEvent({ cart: { id: 'x', items: [] } })).toBeNull()
  })

  it('normalizes order events, coupons, refunds, and billing contacts', () => {
    const order = normalizeOrderEvent({
      order: {
        id: 9001,
        cart_id: 'wc-cart-token',
        status: 'processing',
        currency: 'USD',
        total: '200.00',
        customer_id: 5,
        billing: { email: 'buyer@example.com', phone: '+15551234567', first_name: 'Ada', last_name: 'Lovelace' },
        line_items: [{ id: 1, product_id: 7, name: 'Trail Shoe', quantity: 1, total: '200.00' }],
        coupon_lines: [{ code: 'SAVE10' }, { code: 'SAVE10' }],
        refund_lines: [{ total: '-20.00' }],
      },
    })

    expect(order).toMatchObject({
      platformOrderId: '9001',
      cartId: 'wc-cart-token',
      total: 200,
      refundedTotal: 20,
      customerEmail: 'buyer@example.com',
      customerPhone: '+15551234567',
      customerName: 'Ada Lovelace',
      couponCodes: ['SAVE10'],
    })
    expect(order?.items).toHaveLength(1)
    expect(normalizeOrderEvent({})).toBeNull()
  })

  it('normalizes customers from billing and shipping fields', () => {
    expect(
      normalizeCustomer({
        id: 5,
        billing: { email: 'buyer@example.com', phone: '+15551234567', first_name: 'Ada', last_name: 'Lovelace' },
      }),
    ).toEqual({
      externalCustomerId: '5',
      name: 'Ada Lovelace',
      email: 'buyer@example.com',
      phone: '+15551234567',
    })
  })
})
