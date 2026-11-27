import { wooCommerceAdapter } from '../adapter'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as unknown as typeof fetch
}

const config = {
  storeId: 'store-1',
  storeUrl: 'https://93.184.216.34',
  credentials: { key: 'ck_test', secret: 'cs_test' },
  webhookSecret: null,
}

const namespaceResponse = () => response({ namespaces: ['wc/v3'] })

describe('WooCommerce coupon safety', () => {
  it('refuses to reuse an exhausted coupon', async () => {
    mockFetch((url) => {
      if (url.endsWith('/wp-json')) return namespaceResponse()
      if (url.includes('/coupons')) {
        return response([{
          id: 1,
          code: 'GAIN1',
          status: 'publish',
          discount_type: 'percent',
          amount: '10',
          usage_limit: 1,
          usage_count: 1,
          date_expires: null,
          minimum_amount: '0',
          product_ids: [],
        }])
      }
      return response({}, 404)
    })

    const result = await wooCommerceAdapter.createCoupon(config, {
      code: 'GAIN1',
      type: 'percentage',
      value: 10,
      usageLimit: 1,
    })

    expect(result).toEqual({ code: 'GAIN1', status: 'failed', verified: false, errorCode: 'coupon_unusable' })
  })

  it('reuses a verified coupon only when amount, expiry, and product scope match', async () => {
    mockFetch((url) => {
      if (url.endsWith('/wp-json')) return namespaceResponse()
      if (url.includes('/coupons')) {
        return response([{
          id: 2,
          code: 'GAIN2',
          status: 'publish',
          discount_type: 'percent',
          amount: '12.5',
          usage_limit: 1,
          usage_count: 0,
          date_expires: null,
          minimum_amount: '25.00',
          product_ids: [42, 77],
        }])
      }
      return response({}, 404)
    })

    const result = await wooCommerceAdapter.createCoupon(config, {
      code: 'GAIN2',
      type: 'percentage',
      value: 12.5,
      usageLimit: 1,
      minimumSubtotal: 25,
      productIds: ['woo-42', '77'],
    })

    expect(result).toEqual({ code: 'GAIN2', status: 'existing', verified: true })
  })

  it('creates a product-scoped coupon and verifies the readback', async () => {
    let listCalls = 0
    let createPayload: Record<string, unknown> | null = null
    mockFetch((url, init) => {
      if (url.endsWith('/wp-json')) return namespaceResponse()
      if (url.includes('/coupons') && init?.method === 'POST') {
        createPayload = JSON.parse(String(init.body ?? '{}'))
        return response({ id: 3 })
      }
      if (url.includes('/coupons')) {
        listCalls += 1
        if (listCalls === 1) return response([])
        return response([{
          id: 3,
          code: 'GAIN3',
          status: 'publish',
          discount_type: 'fixed_cart',
          amount: '5.00',
          usage_limit: 1,
          usage_count: 0,
          date_expires: null,
          minimum_amount: '0',
          product_ids: [42],
        }])
      }
      return response({}, 404)
    })

    const result = await wooCommerceAdapter.createCoupon(config, {
      code: 'GAIN3',
      type: 'fixed',
      value: 5,
      usageLimit: 1,
      productIds: ['woo-42'],
    })

    expect(createPayload).toMatchObject({ product_ids: [42] })
    expect(result).toEqual({ code: 'GAIN3', status: 'created', verified: true })
  })

  it('fails verification when the created coupon loses its product scope', async () => {
    let listCalls = 0
    mockFetch((url, init) => {
      if (url.endsWith('/wp-json')) return namespaceResponse()
      if (url.includes('/coupons') && init?.method === 'POST') return response({ id: 4 })
      if (url.includes('/coupons')) {
        listCalls += 1
        if (listCalls === 1) return response([])
        return response([{
          id: 4,
          code: 'GAIN4',
          status: 'publish',
          discount_type: 'percent',
          amount: '10',
          usage_limit: 1,
          usage_count: 0,
          date_expires: null,
          minimum_amount: '0',
          product_ids: [],
        }])
      }
      return response({}, 404)
    })

    const result = await wooCommerceAdapter.createCoupon(config, {
      code: 'GAIN4',
      type: 'percentage',
      value: 10,
      usageLimit: 1,
      productIds: ['42'],
    })

    expect(result).toEqual({
      code: 'GAIN4',
      status: 'failed',
      verified: false,
      errorCode: 'coupon_verification_failed',
    })
  })
})
