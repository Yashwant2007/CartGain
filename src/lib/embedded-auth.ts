import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { verifyShopifySessionToken } from '@/lib/shopify-session-token'
import prisma from '@/lib/db'

export async function getAuthContext(req: NextRequest) {
  // 1) Try normal NextAuth session first (website login)
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true },
      })
      if (user) {
        const store = await prisma.store.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, domain: true, platform: true },
        })
        return { type: 'nextauth' as const, user, store }
      }
    }
  } catch {
    // ignore
  }

  // 2) Try App Bridge session token (embedded Shopify admin)
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const decoded = verifyShopifySessionToken(token)
      if (decoded?.shop) {
        const store = await prisma.store.findFirst({
          where: { domain: { equals: decoded.shop, mode: 'insensitive' }, platform: 'shopify', apiKey: { not: null } },
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

  return null
}
