import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainRecommendEventSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { assertSessionOwnership, verifySessionToken } from '@/lib/bargain/session-bind'
import { recommendationEventMetadata, type RecommendationFeedbackAction } from '@/lib/bargain/recommendations'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { track } from '@/lib/analytics/track'

export const dynamic = 'force-dynamic'

// POST /api/bargain/recommend/event — shopper interacted with a recommendation
// card (viewed / added to cart). Validates session ownership, then records the
// analytics event. Never returns recommendation data — this is write-only.

const EVENT_NAMES: Record<RecommendationFeedbackAction, string> = {
  shown: 'cartgain_recommendation_shown',
  viewed: 'cartgain_recommendation_viewed',
  clicked: 'cartgain_recommendation_clicked',
  added: 'cartgain_recommended_product_added',
  dismissed: 'cartgain_recommendation_dismissed',
  rejected: 'cartgain_recommendation_rejected',
}

export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_recommend_event_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

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
      tokenOk: verifySessionToken(bargainSession.id, data.sessionToken),
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason }, { status: 403 })
    }

    await prisma.bargainMessage.create({
      data: {
        sessionId: bargainSession.id,
        role: 'system',
        content: 'recommendation_feedback',
        metadata: recommendationEventMetadata({
          action: data.action as RecommendationFeedbackAction,
          productId: data.productId,
        }) as any,
      },
    })

    await track({
      name: EVENT_NAMES[data.action as RecommendationFeedbackAction],
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