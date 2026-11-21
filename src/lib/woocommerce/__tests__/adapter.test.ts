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

const input = {
  storeId: 'store-1',
  storeUrl: 'https://93.184.216.34',
  credentials: { key: 'ck_test_key', secret: 'cs_test_secret' },
  webhookSecret: null,
}

function mockFetch(handler: (url: string) => Response) {
  global.fetch = (async (request: RequestInfo | URL) => handler(String(request))) as unknown as typeof fetch
}

describe('WooCommerce connection verification fallback', () => {
  it('verifies with the products endpoint when system status is unavailable', async () => {
    mockFetch((url) => {
      if (url.endsWith('/wp-json')) return response({ namespaces: ['wc/v3'] })
      if (url.includes('/system_status')) return response({ code: 'rest_no_route' }, 404)
      if (url.includes('/products')) return response([{ id: 1, name: 'Sample' }])
      return response({}, 404)
    })

    const result = await wooCommerceAdapter.verifyConnection(input)

    expect(result.verified).toBe(true)
    expect(result.profile?.url).toBe('https://93.184.216.34')
    expect(result.profile?.raw).toMatchObject({ verificationFallback: 'products' })
  })

  it('reports credential errors from the fallback endpoint', async () => {
    mockFetch((url) => {
      if (url.endsWith('/wp-json')) return response({ namespaces: ['wc/v3'] })
      if (url.includes('/system_status')) return response({ code: 'rest_no_route' }, 404)
      if (url.includes('/products')) return response({ code: 'unauthorized' }, 401)
      return response({}, 404)
    })

    const result = await wooCommerceAdapter.verifyConnection(input)

    expect(result).toMatchObject({ verified: false, errorCode: 'invalid_credentials' })
  })
})
