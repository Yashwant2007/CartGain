import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { JWT } from 'next-auth/jwt'

// Protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/dashboard/:path*',
  '/api/campaigns',
  '/api/carts',
  '/api/analytics/:path*',
  '/api/integrations/:path*',
]

// Public routes that don't require authentication
const publicRoutes = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/privacy',
  '/terms',
]

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // If user is authenticated and tries to access login/signup, redirect to dashboard
    if (token && (pathname === '/login' || pathname === '/signup')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // If user is not authenticated and tries to access protected routes, redirect to login
    if (!token && protectedRoutes.some(route => {
      const routePattern = route.replace(':path*', '.*')
      return new RegExp(`^${routePattern}`).test(pathname)
    })) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname

        // Check if route is protected
        const isProtected = protectedRoutes.some(route => {
          const routePattern = route.replace(':path*', '.*')
          return new RegExp(`^${routePattern}`).test(pathname)
        })

        // If protected route, user must be authenticated
        if (isProtected) {
          return !!token
        }

        // Public routes are always accessible
        return true
      },
    },
    pages: {
      signIn: '/login',
      error: '/login',
    },
  }
)

// Config - which routes should middleware run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
