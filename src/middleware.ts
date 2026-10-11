import { withAuth, NextRequestWithAuth } from 'next-auth/middleware'
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server'

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
  '/api/bargain/', // storefront widget (arbitrary merchant store domains)
  '/api/webhooks/', // HMAC-verified provider callbacks
  '/api/shopify/', // OAuth install/callback + session-token endpoints
  '/api/auth/callback/', // OAuth provider callback
  '/api/health',
  '/api/opt-out', // public unsubscribe
  '/api/analytics/events', // public funnel events
]

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some(name => Boolean(req.cookies.get(name)?.value))
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
  return CSRF_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))
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

    return response
  }

  const response = await auth(req, event)
  if (response) {
    clearStaleCookies(response.headers)
  }
  return response
}

export const config = {
  // /setup is the post-signup onboarding step — protect it server-side too so a
  // logged-out visitor hitting the URL directly is sent to /login instead of a
  // client-side redirect flicker inside the page. /api runs through the same
  // middleware only for trace-id injection (auth stays inside each route).
  matcher: ['/dashboard/:path*', '/setup', '/api/:path*'],
}
