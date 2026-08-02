import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Decode the Shopify App Bridge session token (JWT, HS256, signed with SHOPIFY_API_SECRET).
// Claims: iss = shop domain (e.g. my-store.myshopify.com), sub = merchant id,
// aud = app api key, exp/nbf/iat.
function verifySessionToken(token: string): { shop: string } | null {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, sigB64] = parts
  const expected = crypto.createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp < now) return null
    if (typeof payload.nbf === 'number' && payload.nbf > now) return null
    const aud = process.env.SHOPIFY_API_KEY
    if (aud && payload.aud !== aud) return null
    if (typeof payload.iss !== 'string' || !payload.iss.endsWith('.myshopify.com')) return null
    return { shop: payload.iss }
  } catch {
    return null
  }
}

// POST /api/shopify/session-token
// Body: { token } — App Bridge session token from an embedded app session.
// Returns the store id the shop maps to (if it exists), so embedded clients can
// resolve their store without a redirect-based OAuth round trip.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      return NextResponse.json({ message: 'token is required' }, { status: 400 })
    }

    const decoded = verifySessionToken(token)
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
