import { withAuth, NextRequestWithAuth } from 'next-auth/middleware'
import { NextFetchEvent } from 'next/server'

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

export default async function middleware(
  req: NextRequestWithAuth,
  event: NextFetchEvent
) {
  const response = await auth(req, event)
  if (response) {
    clearStaleCookies(response.headers)
  }
  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
