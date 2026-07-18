import { withAuth } from 'next-auth/middleware'

const isHttps =
  process.env.NEXTAUTH_URL?.startsWith('https://') ||
  process.env.VERCEL_URL !== undefined ||
  process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/login',
  },
  cookies: isHttps ? {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
    },
  } : undefined,
})

export const config = {
  matcher: ['/dashboard/:path*'],
}
