import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { verifyShopifySessionToken } from '@/lib/shopify-session-token'

export const dynamic = 'force-dynamic'

// POST /api/shopify/session-token
// Body: { token } — App Bridge session token from an embedded app session.
// Returns the store id the shop maps to (if it exists), so embedded clients can
// resolve their store without a redirect-based OAuth round trip.
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('shopify-session-token', {
      maxAttempts: 30,
      windowMs: 5 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      return NextResponse.json({ message: 'token is required' }, { status: 400 })
    }

    const decoded = verifyShopifySessionToken(token)
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid session token' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { domain: decoded.shop, userId: session.user.id },
      select: { id: true, name: true, domain: true, platform: true, isActive: true },
    })

    return NextResponse.json({
      shop: decoded.shop,
      store: store
        ? { id: store.id, name: store.name, domain: store.domain, platform: store.platform, isActive: store.isActive }
        : null,
    })
  } catch (error) {
    console.error('[SHOPIFY_SESSION_TOKEN]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
