jest.mock('@/lib/shopify', () => ({
  getAccessToken: jest.fn(),
}))

jest.mock('@/lib/redis', () => ({
  redisGet: jest.fn(),
  redisSet: jest.fn(),
}))

import { getAccessToken } from '@/lib/shopify'
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
  ok: true,
  status: 200,
  json: async () => ({ product: { id: 123, image: src ? { src } : null, images: [] } }),
})

describe('product image resolver', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    ;(redisGet as jest.Mock).mockResolvedValue(null)
    ;(redisSet as jest.Mock).mockResolvedValue(undefined)
    ;(getAccessToken as jest.Mock).mockResolvedValue('shpat_test')
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('prefers the image captured with the line item (no API call)', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as any

    const image = await resolveCartProductImage(store, [
      { name: 'Board', productId: '123', image: 'https://cdn.shopify.com/board.jpg' },
    ])

    expect(image).toBe('https://cdn.shopify.com/board.jpg')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the product hero image by id, normalises it, and caches it', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(productResponse('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=9'))
    global.fetch = fetchMock as any

    const image = await resolveCartProductImage(store, [{ name: 'Board', productId: '123' }])

    expect(image).toBe('https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=9')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/api/2026-04/products/123.json')
    expect(fetchMock.mock.calls[0][1].headers['X-Shopify-Access-Token']).toBe('shpat_test')
    expect(redisSet).toHaveBeenCalledWith(
      'product-image:store_1:123',
      'https://cdn.shopify.com/s/files/1/1/1/products/board.jpg?v=9',
      expect.any(Number),
    )
  })

  it('accepts gid product ids', async () => {
    const fetchMock = jest.fn().mockResolvedValue(productResponse('https://cdn.shopify.com/x.jpg'))
    global.fetch = fetchMock as any

    const image = await fetchShopifyProductImage(store, 'gid://shopify/Product/124')
    expect(image).toBe('https://cdn.shopify.com/x.jpg')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/products/124.json')
  })

  it('serves a cached URL without calling Shopify', async () => {
    ;(redisGet as jest.Mock).mockResolvedValue('https://cdn.shopify.com/cached.jpg')
    const fetchMock = jest.fn()
    global.fetch = fetchMock as any

    expect(await fetchShopifyProductImage(store, '999')).toBe('https://cdn.shopify.com/cached.jpg')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not treat a 401 as "product has no image"', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as any

    expect(await fetchShopifyProductImage(store, '125')).toBeUndefined()
    expect(redisSet).not.toHaveBeenCalled()
  })

  it('returns undefined when nothing can be resolved', async () => {
    global.fetch = jest.fn().mockResolvedValue(productResponse(null)) as any
    expect(await resolveCartProductImage(store, [{ name: 'Mystery' }])).toBeUndefined()
  })

  it('enriches every item that has a product id and reports the change', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(productResponse('https://cdn.shopify.com/a.jpg'))
      .mockResolvedValueOnce(productResponse('https://cdn.shopify.com/b.jpg')) as any

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
    global.fetch = jest.fn() as any
    const { changed } = await enrichCartItemsWithImages(store, [
      { name: 'A', productId: '1', image: 'https://cdn.shopify.com/a.jpg' },
    ])
    expect(changed).toBe(false)
  })
})
