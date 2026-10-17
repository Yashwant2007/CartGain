import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { issueRetentionDiscount } from '@/lib/bargain/purchase'
import { assertSessionOwnership, verifySessionToken } from '@/lib/bargain/session-bind'

export const dynamic = 'force-dynamic'

// GET /api/bargain/session/[id] — customer polls session status (no auth —
// storefront). The caller must reproduce one of the session's buyer identities
// (fingerprint / email / cart token) — otherwise the response would leak the
// discount code, final price and full transcript to anyone holding the id.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_session_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, offeredPrice: true, createdAt: true },
        },
      },
    })

    if (!bargainSession) {
      return NextResponse.json({ message: 'Session not found' }, { status: 404 })
    }

    // Ownership binding — mirrors /offer and /accept. Sessions with no stored
    // identity are only readable with a valid signed session token; everything
    // else requires a matching identity handle (or the token).
    const ownership = assertSessionOwnership(bargainSession, {
      customerFingerprint: request.nextUrl.searchParams.get('customerFingerprint'),
      customerEmail: request.nextUrl.searchParams.get('customerEmail'),
      cartToken: request.nextUrl.searchParams.get('cartToken'),
      tokenOk: verifySessionToken(bargainSession.id, request.nextUrl.searchParams.get('sessionToken')),
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason }, { status: 403 })
    }

    // Expire it if past due (lazy expiry). An expired negotiation still leaves
    // the customer with the last price we offered, so they can complete later.
    let status = bargainSession.status
    if (status === 'active' && bargainSession.expiredAt < new Date()) {
      await prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: { status: 'expired' },
      })
      await issueRetentionDiscount(bargainSession.id).catch(() => null)
      status = 'expired'
    }

    return NextResponse.json({
      sessionId: bargainSession.id,
      status,
      originalPrice: bargainSession.originalPrice,
      finalPrice: bargainSession.finalPrice,
      discountCode: bargainSession.discountCode,
      purchaseUrl: bargainSession.purchaseUrl,
      attemptsUsed: bargainSession.attemptsUsed,
      expiresAt: bargainSession.expiredAt.toISOString(),
      messages: bargainSession.messages,
    })
  } catch (error) {
    console.error('[BARGAIN_SESSION_POLL]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
