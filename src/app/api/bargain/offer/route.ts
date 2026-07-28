import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainOfferSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { negotiateStep, ruleBasedDecision, buildOpeningMessage, buildCustomerContext, type NegotiationContext } from '@/lib/services/bargain'

export const dynamic = 'force-dynamic'

function extractPrice(text: string): number | null {
  const patterns = [
    /(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:\$|USD)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:€|EUR)\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:\$|dollars?|usd)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|euros?|eur)/i,
    /\b(\d+(?:\.\d{1,2})?)\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const val = parseFloat(match[1])
      if (val > 0 && val < 1_000_000) return val
    }
  }
  return null
}

// POST /api/bargain/offer — customer sends a message, AI responds
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateOrThrow(bargainOfferSchema, body)
    const customerOffer = extractPrice(data.message)

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        store: true,
      },
    })

    if (!bargainSession) {
      return NextResponse.json({ message: 'Bargain session not found' }, { status: 404 })
    }
    if (bargainSession.status !== 'active') {
      const terminalReplies: Record<string, string> = {
        accepted: 'This deal is already done! 🎉 Your discount code is ready. Start a new session if you\'re interested in another product.',
        rejected: 'This negotiation has ended. Start a new session for a different product if you\'d like to bargain again.',
        expired: 'This session expired. Please start a new one if you\'re still interested.',
        abandoned: 'This session was abandoned. Please start a new one.',
      }
      return NextResponse.json({
        message: terminalReplies[bargainSession.status] ?? `Session is ${bargainSession.status}. No further messages accepted.`,
        terminal: true,
        status: bargainSession.status,
      }, { status: 409 })
    }
    if (bargainSession.expiredAt < new Date()) {
      await prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: { status: 'expired' },
      })
      return NextResponse.json({ message: 'Session expired' }, { status: 410 })
    }

    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: bargainSession.storeId },
    })
    if (!config || !config.enabled) {
      return NextResponse.json({ message: 'Bargaining disabled' }, { status: 403 })
    }

    const currencySymbol = bargainSession.store.currency === 'INR' ? '₹' : bargainSession.store.currency === 'USD' ? '$' : bargainSession.store.currency + ' '

    // Compute floor price
    const { minPrice, productTitle } = await (async () => {
      const product = await prisma.bargainProduct.findUnique({
        where: {
          storeId_shopifyProductId: {
            storeId: bargainSession.storeId,
            shopifyProductId: bargainSession.shopifyProductId,
          },
        },
      })
      let title = product?.productTitle ?? undefined
      if (product?.minPrice != null) {
        return { minPrice: Math.min(product.minPrice, bargainSession.originalPrice), productTitle: title }
      }
      const profitPercent = product?.minProfitPercent ?? config.minProfitPercent
      let floor = bargainSession.originalPrice * (1 - profitPercent / 100)
      if (product?.maxDiscountPercent != null) {
        const cap = bargainSession.originalPrice * (1 - product.maxDiscountPercent / 100)
        floor = Math.max(floor, cap)
      }
      return { minPrice: Math.round(floor * 100) / 100, productTitle: title }
    })()

    // Atomic attempt claim — prevents race conditions from concurrent requests
    const claimResult = await prisma.bargainSession.updateMany({
      where: {
        id: bargainSession.id,
        status: 'active',
        attemptsUsed: bargainSession.attemptsUsed,
      },
      data: { attemptsUsed: { increment: 1 } },
    })
    if (claimResult.count === 0) {
      // Another request already claimed this attempt or status changed
      const refreshed = await prisma.bargainSession.findUnique({ where: { id: bargainSession.id }, select: { status: true, attemptsUsed: true } })
      if (!refreshed || refreshed.status !== 'active') {
        return NextResponse.json({ message: `Session is ${refreshed?.status ?? 'gone'}.`, terminal: true, status: refreshed?.status }, { status: 409 })
      }
      return NextResponse.json({ message: 'Too fast — someone else just used this attempt. Please try again.', terminal: false }, { status: 429 })
    }

    const attemptsUsed = bargainSession.attemptsUsed + 1
    const attemptsRemaining = Math.max(0, config.maxAttempts - attemptsUsed)
    const attemptsExhausted = attemptsUsed >= config.maxAttempts

    if (attemptsExhausted && attemptsRemaining <= 0) {
      const rejectReply = 'Sorry, you\'ve used all your attempts for this item. Maybe next time! 🙂'
      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: { sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: rejectReply,
            metadata: { tactic: 'reject_graceful', reason: 'attempts_exhausted' } as any,
          },
        }),
        prisma.bargainSession.update({
          where: { id: bargainSession.id },
          data: { status: 'rejected', currentOffer: customerOffer ?? bargainSession.currentOffer },
        }),
      ])
      return NextResponse.json({ reply: rejectReply, decision: 'reject', attemptsRemaining: 0, sessionStatus: 'rejected' })
    }

    const ctx: NegotiationContext = {
      storeName: bargainSession.store.name,
      currencySymbol,
      originalPrice: bargainSession.originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts: config.maxAttempts,
      persona: config.aiPersona as NegotiationContext['persona'],
      productTitle,
      customerContext: await buildCustomerContext(bargainSession.storeId, bargainSession.customerEmail),
    }

    const history = bargainSession.messages
      .filter((m: any) => m.role === 'customer' || m.role === 'ai')
      .map((m: any) => ({
        role: (m.role === 'customer' ? 'customer' : 'ai') as 'customer' | 'ai',
        content: m.content,
        offeredPrice: m.offeredPrice ?? undefined,
      }))

    const result = await negotiateStep(ctx, history, data.message, customerOffer ?? undefined)

    const sessionStatus =
      result.decision === 'accept' ? 'accepted' :
      result.decision === 'reject' ? 'rejected' : 'active'

    const [customerMsg, aiMsg, updatedSession] = await prisma.$transaction([
      prisma.bargainMessage.create({
        data: { sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null },
      }),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id, role: 'ai', content: result.reply,
          offeredPrice: result.counterOffer ?? null,
          metadata: { decision: result.decision, tactic: result.tactic, sentiment: result.sentiment, ...(result.metadata ?? {}) } as any,
        },
      }),
      prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: {
          currentOffer: customerOffer ?? bargainSession.currentOffer,
          status: sessionStatus,
          finalPrice: result.decision === 'accept' ? (result.counterOffer ?? customerOffer ?? bargainSession.currentOffer) : null,
        },
      }),
    ])

    return NextResponse.json({
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer ?? null,
      attemptsRemaining,
      sessionStatus,
      finalPrice: updatedSession.finalPrice,
      sessionId: bargainSession.id,
    })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_OFFER]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
