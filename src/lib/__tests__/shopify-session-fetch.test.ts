/**
 * @jest-environment jsdom
 *
 * The embedded app authenticates with a short-lived Shopify ID token that
 * must reach the backend on every same-origin /api request. These tests pin
 * the client behaviour that guarantees it:
 *
 *  - a bounded token lookup (App Bridge can hang for 60s),
 *  - the Authorization header on same-origin /api requests,
 *  - a single retry with a fresh token when the backend answers 401 with
 *    `X-Shopify-Retry-Invalid-Session-Request`,
 *  - no header leaking to other origins.
 */
import { jest } from '@jest/globals'

const TOKEN_HEADER = 'X-Shopify-Retry-Invalid-Session-Request'

type Bridge = { idToken: () => Promise<string>; ready?: Promise<unknown> }

// jsdom ships neither Request nor Response.
class FakeRequest {
  url: string
  method: string
  headers: Headers
  constructor(input: unknown, init?: { headers?: HeadersInit; method?: string }) {
    const source = input as { url?: string; method?: string; headers?: HeadersInit }
    this.url = typeof input === 'string' ? input : source?.url || String(input)
    this.method = init?.method || source?.method || 'GET'
    this.headers = new Headers(init?.headers || source?.headers || undefined)
  }
}

class FakeResponse {
  status: number
  ok: boolean
  headers: Headers
  private body: unknown
  constructor(body?: unknown, init?: { status?: number; headers?: HeadersInit }) {
    this.body = body
    this.status = init?.status ?? 200
    this.ok = this.status >= 200 && this.status < 300
    this.headers = new Headers(init?.headers || undefined)
  }
  async json() {
    return this.body
  }
}

function setBridge(bridge: Partial<Bridge> | undefined) {
  ;(window as unknown as { shopify?: Partial<Bridge> }).shopify = bridge
}

describe('shopifySessionFetch', () => {
  let fetchMock: jest.Mock
  let mod: typeof import('../shopify-session-fetch')

  beforeEach(() => {
    jest.resetModules()
    ;(globalThis as unknown as { Request: unknown }).Request = FakeRequest
    ;(globalThis as unknown as { Response: unknown }).Response = FakeResponse
    fetchMock = jest.fn(async () => new FakeResponse('{}')) as unknown as jest.Mock
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
    window.history.replaceState({}, '', '/dashboard?shop=my-store.myshopify.com')
    setBridge({ idToken: async () => 'token-1' })
    mod = require('../shopify-session-fetch') as typeof import('../shopify-session-fetch')
  })

  it('attaches the ID token to same-origin /api requests', async () => {
    await mod.shopifySessionFetch('/api/subscription')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers as HeadersInit)
    expect(headers.get('Authorization')).toBe('Bearer token-1')
  })

  it('does not attach the token to other origins', async () => {
    await mod.shopifySessionFetch('https://example.com/api/data')
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined
    const headers = init?.headers ? new Headers(init.headers as HeadersInit) : new Headers()
    expect(headers.get('Authorization')).toBeNull()
  })

  it('does not attach the token to same-origin non-api paths', async () => {
    await mod.shopifySessionFetch('/dashboard')
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined
    const headers = init?.headers ? new Headers(init.headers as HeadersInit) : new Headers()
    expect(headers.get('Authorization')).toBeNull()
  })

  it('retries once with a fresh token when the backend asks for it', async () => {
    const tokens = ['token-1', 'token-2']
    let call = 0
    setBridge({
      idToken: async () => {
        const t = tokens[Math.min(call, tokens.length - 1)]
        call += 1
        return t
      },
    })

    fetchMock.mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new FakeResponse('{}', { status: 401, headers: { [TOKEN_HEADER]: '1' } })
      }
      return new FakeResponse('{}')
    })

    const res = await mod.shopifySessionFetch('/api/subscription')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryHeaders = new Headers(
      (fetchMock.mock.calls[1][1] as RequestInit).headers as HeadersInit
    )
    expect(retryHeaders.get('Authorization')).toBe('Bearer token-2')
  })

  it('gives up instead of hanging when App Bridge never answers', async () => {
    setBridge({ idToken: () => new Promise<string>(() => undefined) })
    const start = Date.now()
    const token = await mod.getShopifyIdToken()
    expect(token).toBeNull()
    expect(Date.now() - start).toBeLessThan(15000)
  }, 20000)

  it('returns null when the page is not embedded', async () => {
    window.history.replaceState({}, '', '/')
    const token = await mod.getShopifyIdToken()
    expect(token).toBeNull()
  })
})
