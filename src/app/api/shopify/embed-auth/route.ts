import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { verifyShopifySessionToken } from '@/lib/shopify-session-token'
import { mintNextAuthSessionCookie } from '@/lib/session-cookie'

export const dynamic = 'force-dynamic'

// POST /api/shopify/embed-auth
// Body: { token } — a Shopify App Bridge session token minted on the Shopify
// origin while the app is running embedded in the admin.
//
// This is the correct way to authenticate an embedded app: instead of relying
// on a third-party (CHIPS-partitioned) cookie surviving the admin iframe, we
// verify Shopify's short-lived signed token and, when the shop already has a
// connected store, mint the same NextAuth session cookie the install flow uses.
// The merchant therefore reaches the dashboard without a Google round-trip.
export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit('shopify-embed-auth', {
      maxAttempts: 60,
      windowMs: 5 * 60 * 1000,
    })
    if (!rateLimit.success) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    let token = typeof body.token === 'string' ? body.token : ''

    // App Bridge also puts the session token on every same-origin request as
    // `Authorization: Bearer <token>`. Accept it so the flow works even when
    // the client cannot call `shopify.idToken()` itself.
    if (!token) {
      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7)
    }
    if (!token) {
      return NextResponse.json({ message: 'token is required' }, { status: 400 })
    }

    const decoded = verifyShopifySessionToken(token, { expectedDest: request.nextUrl.origin })
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid session token' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { domain: { equals: decoded.shop, mode: 'insensitive' }, platform: 'shopify', apiKey: { not: null } },
      select: { id: true, userId: true },
    })

    // Not connected yet → tell the client so it can run the install OAuth.
    if (!store) {
      return NextResponse.json({ connected: false, needsInstall: true, shop: decoded.shop })
    }

    const user = await prisma.user.findUnique({
      where: { id: store.userId },
      select: { id: true, email: true, name: true, password: true, tokenVersion: true },
    })
    if (!user) {
      return NextResponse.json({ connected: false, needsInstall: true, shop: decoded.shop })
    }

    const res = NextResponse.json({
      connected: true,
      shop: decoded.shop,
      storeId: store.id,
      userId: user.id,
    })
    await mintNextAuthSessionCookie(res, {
      sub: user.id,
      email: user.email,
      name: user.name,
      storeId: store.id,
      requirePassword: !user.password,
      tokenVersion: user.tokenVersion ?? 0,
    })
    return res
  } catch (error) {
    console.error('[SHOPIFY_EMBED_AUTH]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
