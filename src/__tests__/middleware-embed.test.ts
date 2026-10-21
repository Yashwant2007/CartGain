/**
 * @jest-environment node
 *
 * The embedded app is served inside the Shopify admin iframe, which always
 * appends `?shop=<store>.myshopify.com` to the app url. The middleware turns
 * that into a request header so the root layout knows to render the App
 * Bridge runtime — and, just as importantly, so the public marketing site
 * never loads it.
 */
import { NextRequest } from 'next/server'
import middleware from '@/middleware'
import { SHOPIFY_EMBED_HEADER, SHOPIFY_EMBED_SHOP_HEADER } from '@/lib/shopify-app-bridge'

const captured: { headers: Headers | null } = { headers: null }

jest.mock('next-auth/middleware', () => ({
  withAuth: jest.fn(() => async (req: any) => {
    captured.headers = req.headers
    return null
  }),
}))

async function run(pathname: string, search = ''): Promise<Headers | null> {
  captured.headers = null
  const req = new NextRequest(`https://cart-gain.com${pathname}${search}`) as any
  const event = { waitUntil: jest.fn() } as any
  await middleware(req, event)
  return captured.headers
}

describe('middleware — Shopify embedded app detection', () => {
  it('marks a dashboard request that carries a myshopify shop as embedded', async () => {
    const headers = await run('/dashboard', '?shop=my-store.myshopify.com&host=abc')
    expect(headers?.get(SHOPIFY_EMBED_HEADER)).toBe('1')
    expect(headers?.get(SHOPIFY_EMBED_SHOP_HEADER)).toBe('my-store.myshopify.com')
  })

  it('does not mark a request without a shop parameter', async () => {
    const headers = await run('/dashboard')
    expect(headers?.get(SHOPIFY_EMBED_HEADER)).toBeNull()
  })

  it('does not mark a request whose shop is not a myshopify domain', async () => {
    const headers = await run('/dashboard', '?shop=evil.example.com')
    expect(headers?.get(SHOPIFY_EMBED_HEADER)).toBeNull()
  })
})
