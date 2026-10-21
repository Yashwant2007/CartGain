import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { verifyShopifySessionToken } from '@/lib/shopify-session-token'
import { readShopifyIdToken, RETRY_INVALID_SESSION_HEADER } from '@/lib/embedded-auth'

export const dynamic = 'force-dynamic'

// POST /api/shopify/session-token
// Body: { token } — App Bridge ID token from an embedded app session.
// Returns the store id the shop maps to (if it exists), so embedded clients can
// resolve their store without a redirect-based OAuth round trip.
//
// The ID token IS the authentication here: it is signed by Shopify with our
// app secret and names the shop it was minted for, so it proves the caller
// is a staff member of that shop. No session cookie is required — the admin
// iframe is a cross-site context where cookies are not reliable.
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('shopify-session-token', {
      maxAttempts: 30,
      windowMs: 5 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    let token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      token = readShopifyIdToken(request) || ''
    }
    if (!token) {
      return NextResponse.json({ message: 'token is required' }, { status: 400 })
    }

    const decoded = verifyShopifySessionToken(token)
    if (!decoded) {
      const res = NextResponse.json({ message: 'Invalid session token' }, { status: 401 })
      // Ask App Bridge to mint a fresh token and retry the request.
      res.headers.set(RETRY_INVALID_SESSION_HEADER, '1')
      return res
    }

    const store = await prisma.store.findFirst({
      where: {
        domain: { equals: decoded.shop, mode: 'insensitive' },
        platform: 'shopify',
      },
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
