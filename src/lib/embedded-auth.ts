import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { verifyShopifySessionToken } from '@/lib/shopify-session-token'
import prisma from '@/lib/db'

// Shopify asks embedded apps to answer an invalid/expired session with this
// header. App Bridge then mints a fresh ID token and retries the request
// once — without it a merchant whose token expired mid-session would simply
// see 401s until they reloaded the app.
export const RETRY_INVALID_SESSION_HEADER = 'X-Shopify-Retry-Invalid-Session-Request'

export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  const res = NextResponse.json({ error: message }, { status: 401 })
  res.headers.set(RETRY_INVALID_SESSION_HEADER, '1')
  return res
}

// Read the Shopify ID token from the request. App Bridge sends it as
// `Authorization: Bearer <token>` on every same-origin request.
export function readShopifyIdToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

export async function getAuthContext(req: NextRequest) {
  // 1) App Bridge ID token (embedded Shopify admin). This is the mechanism
  //    Shopify requires for embedded apps: the admin iframe is a cross-site
  //    context, so the session cookie is not reliably available there.
  try {
    const token = readShopifyIdToken(req)
    if (token) {
      const decoded = verifyShopifySessionToken(token)
      if (decoded?.shop) {
        const store = await prisma.store.findFirst({
          where: { domain: { equals: decoded.shop, mode: 'insensitive' }, platform: 'shopify' },
          select: { id: true, userId: true, domain: true },
        })
        if (store?.userId) {
          const user = await prisma.user.findUnique({
            where: { id: store.userId },
            select: { id: true, email: true, name: true },
          })
          if (user) {
            return { type: 'shopify_session' as const, user, store, shop: decoded.shop }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 2) Normal NextAuth session (website login / partitioned iframe cookie).
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true },
      })
      if (user) {
        // Scope the store to the one the session was issued for. A merchant
        // can own several shops; the session carries the active one.
        const sessionStoreId = session.user.storeId
        const store = await prisma.store.findFirst({
          where: sessionStoreId
            ? { id: sessionStoreId, userId: user.id }
            : { userId: user.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, domain: true, platform: true },
        })
        return { type: 'nextauth' as const, user, store }
      }
    }
  } catch {
    // ignore
  }

  return null
}
