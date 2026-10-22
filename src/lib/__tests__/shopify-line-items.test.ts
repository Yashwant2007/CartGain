import { normalizeImageUrl, normalizeShopifyLineItems, toNumericId } from '../shopify-line-items'

describe('normalizeImageUrl', () => {
  it('reads the checkout-webhook field that the old mapper ignored', () => {
    expect(normalizeImageUrl('https://cdn.shopify.com/s/files/1/1/1/products/a.jpg?v=1')).toBe(
      'https://cdn.shopify.com/s/files/1/1/1/products/a.jpg?v=1',
    )
  })

  it('accepts { src } and { url } objects', () => {
    expect(normalizeImageUrl({ src: 'https://cdn.shopify.com/a.jpg' })).toBe('https://cdn.shopify.com/a.jpg')
    expect(normalizeImageUrl({ url: 'https://cdn.shopify.com/b.jpg' })).toBe('https://cdn.shopify.com/b.jpg')
  })

  it('upgrades protocol-relative URLs (Meta rejects them)', () => {
    expect(normalizeImageUrl('//cdn.shopify.com/c.jpg')).toBe('https://cdn.shopify.com/c.jpg')
  })

  it('ignores blank / relative values', () => {
    expect(normalizeImageUrl(undefined)).toBeUndefined()
    expect(normalizeImageUrl('')).toBeUndefined()
    expect(normalizeImageUrl('/products/a.jpg')).toBeUndefined()
    expect(normalizeImageUrl({ src: null })).toBeUndefined()
  })
})

describe('toNumericId', () => {
  it('strips Shopify gid prefixes', () => {
    expect(toNumericId('gid://shopify/Product/123')).toBe('123')
    expect(toNumericId('gid://shopify/ProductVariant/456')).toBe('456')
  })

  it('keeps plain numeric ids and rejects junk', () => {
    expect(toNumericId(789)).toBe('789')
    expect(toNumericId('789')).toBe('789')
    expect(toNumericId('abc')).toBeUndefined()
    expect(toNumericId(null)).toBeUndefined()
  })
})

describe('normalizeShopifyLineItems', () => {
  it('captures image_url, product id and variant id from a checkout payload', () => {
    const items = normalizeShopifyLineItems([
      {
        title: 'Snowboard',
        variant_title: 'Black / 152',
        price: '693.45',
        quantity: 1,
        product_id: 999,
        variant_id: 1001,
        sku: 'SB-152',
        image_url: 'https://cdn.shopify.com/s/files/1/1/1/products/snowboard.jpg?v=2',
      },
    ])

    expect(items).toEqual([
      {
        name: 'Snowboard',
        description: 'Black / 152',
        price: 693.45,
        quantity: 1,
        image: 'https://cdn.shopify.com/s/files/1/1/1/products/snowboard.jpg?v=2',
        productId: '999',
        variantId: '1001',
        sku: 'SB-152',
      },
    ])
  })

  it('handles GraphQL-shaped items (gid ids, image.src, money amount)', () => {
    const [item] = normalizeShopifyLineItems([
      {
        name: 'Hoodie',
        quantity: 2,
        price_set: { shop_money: { amount: '49.90' } },
        product: { id: 'gid://shopify/Product/42' },
        variant: { id: 'gid://shopify/ProductVariant/43', title: 'Large' },
        image: { src: '//cdn.shopify.com/hoodie.png' },
      },
    ])

    expect(item).toMatchObject({
      name: 'Hoodie',
      description: 'Large',
      price: 49.9,
      quantity: 2,
      image: 'https://cdn.shopify.com/hoodie.png',
      productId: '42',
      variantId: '43',
    })
  })

  it('returns an empty array for unexpected payloads', () => {
    expect(normalizeShopifyLineItems(null)).toEqual([])
    expect(normalizeShopifyLineItems({})).toEqual([])
  })
})
