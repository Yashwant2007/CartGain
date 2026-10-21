/**
 * @jest-environment node
 *
 * The embedded app is served inside the Shopify admin iframe, which always
 * appends `?shop=<store>.myshopify.com` to the app url. The middleware turns
 * that into a request header so the root layout knows to render the App
 * Bridge runtime — and, just as importantly, so the public marketing site
 * never loads it.
 *
 * The header only reaches the render when the middleware passes it on
 * explicitly (`x-middleware-override-headers`), so these tests assert the
 * response headers, not just the mutated request.
 */
import { NextRequest } from 'next/server'
import middleware from '@/middleware'
import { SHOPIFY_EMBED_HEADER, SHOPIFY_EMBED_SHOP_HEADER } from '@/lib/shopify-app-bridge'

const captured: { headers: Headers | null } = { headers: null }
const authState: { mode: 'authorized' | 'redirect' } = { mode: 'authorized' }

jest.mock('next-auth/middleware', () => ({
  withAuth: jest.fn(() => async (req: any) => {
    captured.headers = req.headers
    // next-auth returns `undefined` for an authorized request and a
    // NextResponse.redirect for an unauthenticated one.
    if (authState.mode === 'authorized') return undefined
    const { NextResponse } = require('next/server')
    return NextResponse.redirect(new URL('/login?callbackUrl=%2Fdashboard', req.url))
  }),
}))

async function run(pathname: string, search = ''): Promise<{ reqHeaders: Headers | null; res: Response }> {
  captured.headers = null
  const req = new NextRequest(`https://cart-gain.com${pathname}${search}`) as any
  const event = { waitUntil: jest.fn() } as any
  const res = await middleware(req, event)
  return { reqHeaders: captured.headers, res }
}

function overriddenRequestHeaders(res: Response): Headers | null {
  const list = res.headers.get('x-middleware-override-headers')
  if (!list) return null
  const headers = new Headers()
  for (const key of list.split(',')) {
    const value = res.headers.get(`x-middleware-request-${key}`)
    if (value !== null) headers.set(key, value)
  }
  return headers
}

describe('middleware — Shopify embedded app detection', () => {
  beforeEach(() => {
    authState.mode = 'authorized'
  })

  it('marks a dashboard request that carries a myshopify shop as embedded', async () => {
    const { reqHeaders } = await run('/dashboard', '?shop=my-store.myshopify.com&host=abc')
    expect(reqHeaders?.get(SHOPIFY_EMBED_HEADER)).toBe('1')
    expect(reqHeaders?.get(SHOPIFY_EMBED_SHOP_HEADER)).toBe('my-store.myshopify.com')
  })

  it('does not mark a request without a shop parameter', async () => {
    const { reqHeaders } = await run('/dashboard')
    expect(reqHeaders?.get(SHOPIFY_EMBED_HEADER)).toBeNull()
  })

  it('does not mark a request whose shop is not a myshopify domain', async () => {
    const { reqHeaders } = await run('/dashboard', '?shop=evil.example.com')
    expect(reqHeaders?.get(SHOPIFY_EMBED_HEADER)).toBeNull()
  })

  it('forwards the embed flag to the render for an authorized request', async () => {
    // next-auth returns undefined here; the middleware must still hand back a
    // response that carries the request-header override, otherwise the App
    // Bridge runtime is missing from the (already signed in) app UI.
    const { res } = await run('/dashboard', '?shop=my-store.myshopify.com&host=abc')
    const forwarded = overriddenRequestHeaders(res)
    expect(forwarded?.get(SHOPIFY_EMBED_HEADER)).toBe('1')
    expect(forwarded?.get(SHOPIFY_EMBED_SHOP_HEADER)).toBe('my-store.myshopify.com')
  })

  it('forwards the embed flag to the render on the sign-in page', async () => {
    const { res } = await run('/login', '?shop=my-store.myshopify.com&host=abc')
    const forwarded = overriddenRequestHeaders(res)
    expect(forwarded?.get(SHOPIFY_EMBED_HEADER)).toBe('1')
  })

  it('keeps the embed context on the auth redirect', async () => {
    authState.mode = 'redirect'
    const { res } = await run('/dashboard', '?shop=my-store.myshopify.com&host=abc')
    const location = res.headers.get('location')
    expect(location).toBeTruthy()
    expect(new URL(location!, 'https://cart-gain.com').searchParams.get('shop')).toBe('my-store.myshopify.com')
    expect(new URL(location!, 'https://cart-gain.com').searchParams.get('host')).toBe('abc')
  })

  it('does not forward the embed flag for a plain public request', async () => {
    const { res } = await run('/dashboard')
    expect(overriddenRequestHeaders(res)?.get(SHOPIFY_EMBED_HEADER)).toBeFalsy()
  })
})
