import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainRecommendEventSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { assertSessionOwnership } from '@/lib/bargain/session-bind'
import { track } from '@/lib/analytics/track'

export const dynamic = 'force-dynamic'

// POST /api/bargain/recommend/event — shopper interacted with a recommendation
// card (viewed / added to cart). Validates session ownership, then records the
// analytics event. Never returns recommendation data — this is write-only.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateOrThrow(bargainRecommendEventSchema, body)

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      include: { store: true },
    })
    if (!bargainSession) {
      return NextResponse.json({ message: 'Bargain session not found' }, { status: 404 })
    }

    const ownership = assertSessionOwnership(bargainSession, {
      customerFingerprint: data.customerFingerprint,
      customerEmail: data.customerEmail,
      cartToken: data.cartToken,
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason }, { status: 403 })
    }

    await track({
      name: data.action === 'added' ? 'cartgain_recommended_product_added' : 'cartgain_recommendation_clicked',
      storeId: bargainSession.storeId,
      properties: {
        productId: data.productId,
        variantId: data.variantId ?? null,
        sessionStatus: bargainSession.status,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_RECO_EVENT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}