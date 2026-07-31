import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// GET /api/bargain/session/[id] — customer polls session status (no auth — storefront)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_session_${request.headers.get('x-forwarded-for') || 'unknown'}`)
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

    // Expire it if past due (lazy expiry)
    let status = bargainSession.status
    if (status === 'active' && bargainSession.expiredAt < new Date()) {
      await prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: { status: 'expired' },
      })
      status = 'expired'
    }

    return NextResponse.json({
      sessionId: bargainSession.id,
      status,
      originalPrice: bargainSession.originalPrice,
      finalPrice: bargainSession.finalPrice,
      discountCode: bargainSession.discountCode,
      attemptsUsed: bargainSession.attemptsUsed,
      expiresAt: bargainSession.expiredAt.toISOString(),
      messages: bargainSession.messages,
    })
  } catch (error) {
    console.error('[BARGAIN_SESSION_POLL]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
