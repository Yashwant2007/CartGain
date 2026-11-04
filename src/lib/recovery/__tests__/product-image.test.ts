jest.mock('@/lib/shopify', () => ({
  shopifyGraphQL: jest.fn(),
}))

jest.mock('@/lib/redis', () => ({
  redisGet: jest.fn(),
  redisSet: jest.fn(),
}))

import { shopifyGraphQL } from '@/lib/shopify'
import { redisGet, redisSet } from '@/lib/redis'
import {
  enrichCartItemsWithImages,
  fetchShopifyProductImage,
  resolveCartProductImage,
} from '../product-image'

const store = {
  id: 'store_1',
  domain: 'shop.myshopify.com',
  apiKey: 'enc',
  shopifyRefreshToken: null,
  shopifyTokenExpiresAt: null,
}

const productResponse = (src: string | null) => ({
  product: {
    featuredImage: src ? { url: src } : null,
    images: { nodes: [] },
  },
})

describe('product image resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(redisGet as jest.Mock).mockResolvedValue(null)
    ;(redisSet as jest.Mock).mockResolvedValue(undefined)
    ;(shopifyGraphQL as jest.Mock).mockResolvedValue(productResponse('https://cdn.shopify.com/default.jpg'))
  })

  it('prefers the image captured with the line item (no API call)', async () => {
    const image = await resolveCartProductImage(store, [
      { name: 'Board', productId: '123', image: 'https://cdn.shopify.com/board.jpg' },
    ])

    expect(image).toBe('https://cdn.shopify.com/board.jpg')
    expect(shopifyGraphQL).not.toHaveBeenCalled()
  })

  it('fetches the product hero image by id, normalises it, and caches it', async () => {
    ;(shopifyGraphQL as jest.Mock).mockResolvedValue(
      productResponse('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=9'),
    )

    const image = await resolveCartProductImage(store, [{ name: 'Board', productId: '123' }])

    expect(image).toBe('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=9')
    expect(shopifyGraphQL).toHaveBeenCalledTimes(1)
    expect(shopifyGraphQL).toHaveBeenCalledWith(
      store,
      expect.stringContaining('ProductImage'),
      { id: 'gid://shopify/Product/123' },
      5000,
    )
    expect(redisSet).toHaveBeenCalledWith(
      'product-image:store_1:123',
      'https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=9',
      expect.any(Number),
    )
  })

  it('accepts gid product ids', async () => {
    ;(shopifyGraphQL as jest.Mock).mockResolvedValue(productResponse('https://cdn.shopify.com/x.jpg'))

    const image = await fetchShopifyProductImage(store, 'gid://shopify/Product/124')
    expect(image).toBe('https://cdn.shopify.com/x.jpg')
    expect(shopifyGraphQL).toHaveBeenCalledWith(
      store,
      expect.any(String),
      { id: 'gid://shopify/Product/124' },
      5000,
    )
  })

  it('serves a cached URL without calling Shopify', async () => {
    ;(redisGet as jest.Mock).mockResolvedValue('https://cdn.shopify.com/cached.jpg')

    expect(await fetchShopifyProductImage(store, '999')).toBe('https://cdn.shopify.com/cached.jpg')
    expect(shopifyGraphQL).not.toHaveBeenCalled()
  })

  it('does not cache a transient Shopify failure as "product has no image"', async () => {
    ;(shopifyGraphQL as jest.Mock).mockRejectedValue(new Error('Shopify GraphQL returned HTTP 401'))

    expect(await fetchShopifyProductImage(store, '125')).toBeUndefined()
    expect(redisSet).not.toHaveBeenCalled()
  })

  it('returns undefined when nothing can be resolved', async () => {
    ;(shopifyGraphQL as jest.Mock).mockResolvedValue(productResponse(null))
    expect(await resolveCartProductImage(store, [{ name: 'Mystery' }])).toBeUndefined()
  })

  it('enriches every item that has a product id and reports the change', async () => {
    ;(shopifyGraphQL as jest.Mock)
      .mockResolvedValueOnce(productResponse('https://cdn.shopify.com/a.jpg'))
      .mockResolvedValueOnce(productResponse('https://cdn.shopify.com/b.jpg'))

    const { items, changed } = await enrichCartItemsWithImages(store, [
      { name: 'A', productId: '1' },
      { name: 'B', productId: '2', image: 'https://cdn.shopify.com/keep.jpg' },
      { name: 'C' },
    ])

    expect(changed).toBe(true)
    expect(items[0].image).toBe('https://cdn.shopify.com/a.jpg')
    expect(items[1].image).toBe('https://cdn.shopify.com/keep.jpg')
    expect(items[2].image).toBeUndefined()
  })

  it('reports no change when the cart already has images', async () => {
    const { changed } = await enrichCartItemsWithImages(store, [
      { name: 'A', productId: '1', image: 'https://cdn.shopify.com/a.jpg' },
    ])
    expect(changed).toBe(false)
  })
})
