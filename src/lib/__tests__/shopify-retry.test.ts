import { retryDelayMs, fetchShopifyCarts } from '@/lib/shopify'

function mockResponse(status: number, retryAfter?: string) {
  return {
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
  }
}

describe('shopify retry/backoff', () => {
  it('honours Retry-After expressed in seconds', () => {
    expect(retryDelayMs(mockResponse(429, '2'), 0)).toBe(2000)
  })

  it('honours Retry-After expressed as an HTTP date', () => {
    const when = new Date(Date.now() + 5000).toUTCString()
    const delay = retryDelayMs(mockResponse(429, when), 0)
    expect(delay).toBeGreaterThan(1000)
    expect(delay).toBeLessThanOrEqual(5000)
  })

  it('caps an absurd Retry-After', () => {
    expect(retryDelayMs(mockResponse(429, '999999'), 0)).toBe(30000)
  })

  it('falls back to exponential backoff without Retry-After', () => {
    expect(retryDelayMs(mockResponse(429), 0)).toBe(500)
    expect(retryDelayMs(mockResponse(503), 1)).toBe(1000)
    expect(retryDelayMs(mockResponse(500), 2)).toBe(2000)
  })
})

describe('shopifyFetch retry loop', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('retries a throttled request and returns the eventual success', async () => {
    let calls = 0
    ;(global as any).fetch = jest.fn(async () => {
      calls++
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (n: string) => (n.toLowerCase() === 'retry-after' ? '0' : null) },
          json: async () => ({}),
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ carts: [{ id: 42 }] }),
      }
    })

    const carts = await fetchShopifyCarts('shop.myshopify.com', 'token')
    expect(carts).toEqual([{ id: 42 }])
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
  })

  it('does not retry a successful response', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ carts: [] }),
    }))
    ;(globalThis as any).fetch = fetchMock
    await fetchShopifyCarts('shop.myshopify.com', 'tok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
