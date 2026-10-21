import { withAuth, NextRequestWithAuth } from 'next-auth/middleware'
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server'
import {
  SHOPIFY_EMBED_HEADER,
  SHOPIFY_EMBED_SHOP_HEADER,
  isValidShopDomain,
} from '@/lib/shopify-app-bridge'

const auth = withAuth({
  callbacks: {
    // Reject revoked tokens (flagged by the jwt callback after a password
    // change/reset) in addition to missing ones.
    authorized: ({ token }) => !!token && !(token as any).revoked,
  },
  pages: {
    signIn: '/login',
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
    },
  },
})

const STALE_COOKIES = [
  '__Secure-next-auth.session-token',
  '__Secure-next-auth.callback-url',
  '__Secure-next-auth.csrf-token',
  '__Secure-next-auth.pkce.code_verifier',
  'next-auth.pkce.code_verifier',
]

function clearStaleCookies(headers: Headers) {
  for (const name of STALE_COOKIES) {
    headers.append(
      'Set-Cookie',
      `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`
    )
  }
}

// Correlation header: every API request gets a trace id that flows through to
// server logs (request.headers x-request-id) and error logs, so a merchant
// report can be tied to the exact server-side events.
const API_TRACE_MATCHER = /^\/api\//

// ─── CSRF defense ────────────────────────────────────────────────────────────
// The session cookie is SameSite=None (required so it survives the embedded
// Shopify admin iframe), which means the browser WILL attach it to cross-site
// requests too. Mutating API calls that ride on the session cookie must
// therefore prove they came from our own origin. Browser requests always carry
// an Origin (or, failing that, a Referer) on state-changing methods, so a
// mismatch means a forged cross-site call.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const SESSION_COOKIE_NAMES = ['next-auth.session-token', '__Secure-next-auth.session-token']
const ALLOWED_EMBED_ORIGINS = new Set(['admin.shopify.com'])
// Public endpoints that legitimately receive cross-origin requests (the
// storefront widget runs on arbitrary merchant domains; webhooks come from
// providers; OAuth callbacks from Google/email). These never rely on a
// merchant session cookie for authorization.
const CSRF_EXEMPT_PREFIXES = [
  '/api/webhooks/', // HMAC-verified provider callbacks
  '/api/shopify/', // OAuth install/callback + session-token endpoints
  '/api/auth/callback/', // OAuth provider callback
  '/api/health',
  '/api/opt-out', // public unsubscribe
  '/api/analytics/events', // public funnel events
]

// Public storefront/bargain endpoints nested under /api/bargain/ that run on
// arbitrary merchant store domains and never authorize via the merchant session
// cookie. Everything ELSE under /api/bargain/ (config, products, sessions,
// demo, goals, catalog, …) IS session-authenticated and must stay CSRF-checked
// — exempting the whole prefix let a cross-site POST rewrite a logged-in
// merchant's bargain config/product floors.
const CSRF_EXEMPT_BARGAIN = [
  '/api/bargain/start',
  '/api/bargain/offer',
  '/api/bargain/accept',
  '/api/bargain/checkout-accept',
  '/api/bargain/recommend/event',
  '/api/bargain/session', // read-only transcript
]

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some(name => Boolean(req.cookies.get(name)?.value))
}

// ─── Shopify embedded-app detection ─────────────────────────────────────────
// The Shopify admin loads the app inside an iframe and always appends
// `?shop=<store>.myshopify.com` (plus `?host=`) to the app URL. That is the
// only trustworthy signal that a request originates from the embedded app:
// a client-supplied header would let any visitor pull the App Bridge runtime
// into the public site, where it aborts (no shop) or redirects the visitor
// into the Shopify admin.
//
// The answer is forwarded to the React tree as a request header so the root
// layout can render the App Bridge <script> into the document head for
// embedded requests only.
//
// Returns the headers to hand downstream: Next.js only propagates request
// header changes to the render when they are passed explicitly through
// `NextResponse.next({ request: { headers } })`.
function markShopifyEmbedRequest(req: NextRequest): Headers | null {
  const shop = req.nextUrl.searchParams.get('shop')
  if (!isValidShopDomain(shop)) return null
  req.headers.set(SHOPIFY_EMBED_HEADER, '1')
  req.headers.set(SHOPIFY_EMBED_SHOP_HEADER, shop)
  return new Headers(req.headers)
}

// Forward the (possibly modified) request headers to the next handler.
function withRequestHeaders(response: Response, headers: Headers): Response {
  const overridden: string[] = []
  headers.forEach((value, key) => {
    response.headers.set(`x-middleware-request-${key}`, value)
    overridden.push(key)
  })
  if (overridden.length > 0) {
    response.headers.set('x-middleware-override-headers', overridden.join(','))
  }
  return response
}

// The auth redirect drops the query string, which would strip the embed
// context (?shop=…&host=…) from the sign-in page. Without it the sign-in page
// is not recognised as an embedded request, so it would not load App Bridge
// and the merchant could not be signed in with a session token.
function preserveEmbedParamsOnRedirect(req: NextRequest, response: Response): void {
  const location = response.headers.get('location')
  if (!location) return
  const shop = req.nextUrl.searchParams.get('shop')
  if (!isValidShopDomain(shop)) return

  try {
    const url = new URL(location, req.url)
    if (url.searchParams.has('shop')) return
    url.searchParams.set('shop', shop)
    const host = req.nextUrl.searchParams.get('host')
    if (host && !url.searchParams.has('host')) url.searchParams.set('host', host)
    response.headers.set('location', url.toString())
  } catch {
    // leave the redirect untouched
  }
}

function isSameOriginRequest(req: NextRequest): boolean {
  const source = req.headers.get('origin') || req.headers.get('referer')
  if (!source) return false
  try {
    const host = new URL(source).host
    return host === req.nextUrl.host || ALLOWED_EMBED_ORIGINS.has(host)
  } catch {
    return false
  }
}

function isCsrfExempt(pathname: string): boolean {
  return (
    CSRF_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix)) ||
    CSRF_EXEMPT_BARGAIN.some(
      path => pathname === path || pathname.startsWith(`${path}/`),
    )
  )
}

export default async function middleware(
  req: NextRequestWithAuth,
  event: NextFetchEvent
) {
  if (API_TRACE_MATCHER.test(req.nextUrl.pathname)) {
    const pathname = req.nextUrl.pathname
    const response = NextResponse.next()
    const existing = req.headers.get('x-request-id')
    const traceId = existing || crypto.randomUUID()
    req.headers.set('x-request-id', traceId)
    response.headers.set('x-request-id', traceId)

    if (
      !SAFE_METHODS.has(req.method) &&
      hasSessionCookie(req) &&
      !isCsrfExempt(pathname) &&
      !isSameOriginRequest(req)
    ) {
      console.warn(`[csrf] blocked cross-origin ${req.method} ${pathname}`)
      const blocked = NextResponse.json({ message: 'Request blocked' }, { status: 403 })
      blocked.headers.set('x-request-id', traceId)
      return blocked
    }

    // Forward the trace id to the route handler — a mutated request header
    // only reaches the handler when it is passed on explicitly.
    withRequestHeaders(response, new Headers(req.headers))
    return response
  }

  // The admin iframe always carries ?shop= — remember that before the auth
  // check so the root layout can render the App Bridge runtime for embedded
  // requests (see markShopifyEmbedRequest).
  const embedHeaders = markShopifyEmbedRequest(req)

  // The sign-in page is the one page the auth wrapper must not protect (it
  // would redirect to itself). It still needs the embed context so an embedded
  // merchant can be signed in with an App Bridge session token.
  if (req.nextUrl.pathname === '/login') {
    const response = NextResponse.next()
    clearStaleCookies(response.headers)
    if (embedHeaders) withRequestHeaders(response, embedHeaders)
    return response
  }

  const response = await auth(req, event)
  if (response) {
    preserveEmbedParamsOnRedirect(req, response)
    clearStaleCookies(response.headers)
    if (embedHeaders && !response.headers.get('location')) {
      withRequestHeaders(response, embedHeaders)
    }
  }
  return response
}

export const config = {
  // /setup is the post-signup onboarding step — protect it server-side too so a
  // logged-out visitor hitting the URL directly is sent to /login instead of a
  // client-side redirect flicker inside the page. /login is matched so an
  // embedded (Shopify admin) sign-in page can load App Bridge and exchange a
  // session token for a CartGain session. /api runs through the same
  // middleware only for trace-id injection (auth stays inside each route).
  matcher: ['/dashboard/:path*', '/setup', '/login', '/api/:path*'],
}
