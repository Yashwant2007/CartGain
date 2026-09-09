import { withAuth, NextRequestWithAuth } from 'next-auth/middleware'
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server'

const auth = withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
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

export default async function middleware(
  req: NextRequestWithAuth,
  event: NextFetchEvent
) {
  if (API_TRACE_MATCHER.test(req.nextUrl.pathname)) {
    const response = NextResponse.next()
    const existing = req.headers.get('x-request-id')
    const traceId = existing || crypto.randomUUID()
    req.headers.set('x-request-id', traceId)
    response.headers.set('x-request-id', traceId)
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
