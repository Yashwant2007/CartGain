import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainCheckoutOpenSchema, handleValidationError, validateOrThrow } from '@/lib/validation/bargain'
import { assertSessionOwnership, verifySessionToken } from '@/lib/bargain/session-bind'
import { CHECKOUT_OPEN_RATE_KEY } from '@/lib/bargain/checkout-lock'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`${CHECKOUT_OPEN_RATE_KEY}${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const data = validateOrThrow(bargainCheckoutOpenSchema, await request.json())
    const session = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      select: {
        id: true,
        customerFingerprint: true,
        customerEmail: true,
        cartToken: true,
        purchaseUrl: true,
        discountCode: true,
        status: true,
        checkoutOpenedAt: true,
      },
    })
    if (!session) return NextResponse.json({ message: 'Session not found' }, { status: 404 })

    const ownership = assertSessionOwnership(session, {
      customerFingerprint: data.customerFingerprint,
      customerEmail: data.customerEmail,
      cartToken: data.cartToken,
      tokenOk: verifySessionToken(data.sessionId, data.sessionToken),
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason || 'Not allowed' }, { status: 403 })
    }

    if (!session.purchaseUrl && !session.discountCode) {
      return NextResponse.json({ message: 'No checkout is available for this session' }, { status: 409 })
    }

    const checkoutUpdate: { checkoutOpenedAt: Date; customerFingerprint?: string } = {
      checkoutOpenedAt: new Date(),
    }
    if (data.customerFingerprint && !session.customerFingerprint) {
      checkoutUpdate.customerFingerprint = data.customerFingerprint
    }
    await prisma.bargainSession.updateMany({
      where: { id: session.id, checkoutOpenedAt: null },
      data: checkoutUpdate,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_CHECKOUT_OPEN]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
