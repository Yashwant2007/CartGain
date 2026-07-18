import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainOfferSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { negotiateStep, ruleBasedDecision, type NegotiationContext } from '@/lib/services/bargain'

export const dynamic = 'force-dynamic'

// POST /api/bargain/offer — submit customer offer, AI responds
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateOrThrow(bargainOfferSchema, body)

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
      return NextResponse.json({
        message: `This session is already ${bargainSession.status}`,
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

    // Load config
    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: bargainSession.storeId },
    })
    if (!config || !config.enabled) {
      return NextResponse.json({ message: 'Bargaining disabled' }, { status: 403 })
    }

    if (bargainSession.attemptsUsed >= config.maxAttempts) {
      // Auto-reject on attempts exceeded
      const rejectResult = ruleBasedDecision(data.offer, {
        storeName: bargainSession.store.name,
        currencySymbol: bargainSession.store.currency === 'INR' ? '₹' : '$',
        originalPrice: bargainSession.originalPrice,
        minPrice: bargainSession.originalPrice, // unreachable
        attemptsUsed: bargainSession.attemptsUsed,
        maxAttempts: config.maxAttempts,
        persona: config.aiPersona as NegotiationContext['persona'],
      })
      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id,
            role: 'customer',
            content: `I'll offer ${data.offer.toFixed(2)}`,
            offeredPrice: data.offer,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id,
            role: 'ai',
            content: 'I\'m sorry, but you\'ve used all your bargaining attempts for this item. Maybe next time! 🙂',
            metadata: { tactic: 'reject_graceful', reason: 'attempts_exhausted' },
          },
        }),
        prisma.bargainSession.update({
          where: { id: bargainSession.id },
          data: {
            status: 'rejected',
            attemptsUsed: bargainSession.attemptsUsed + 1,
            currentOffer: data.offer,
          },
        }),
      ])
      return NextResponse.json({
        reply: 'I\'m sorry, but you\'ve used all your bargaining attempts for this item. Maybe next time! 🙂',
        decision: 'reject',
        attemptsRemaining: 0,
        sessionStatus: 'rejected',
      })
    }

    const currencySymbol = bargainSession.store.currency === 'INR' ? '₹' : bargainSession.store.currency === 'USD' ? '$' : bargainSession.store.currency + ' '

    // Compute floor price (recompute each step — config/override could change)
    const { minPrice } = await (async () => {
      // Inline computeMinPrice without circular dep on engine import (re-implement minimal here)
      const product = await prisma.bargainProduct.findUnique({
        where: {
          storeId_shopifyProductId: {
            storeId: bargainSession.storeId,
            shopifyProductId: bargainSession.shopifyProductId,
          },
        },
      })
      if (product?.minPrice != null) {
        return { minPrice: Math.min(product.minPrice, bargainSession.originalPrice) }
      }
      const profitPercent = product?.minProfitPercent ?? config.minProfitPercent
      let floor = bargainSession.originalPrice * (1 - profitPercent / 100)
      if (product?.maxDiscountPercent != null) {
        const cap = bargainSession.originalPrice * (1 - product.maxDiscountPercent / 100)
        floor = Math.max(floor, cap)
      }
      return { minPrice: Math.round(floor * 100) / 100 }
    })()

    const ctx: NegotiationContext = {
      storeName: bargainSession.store.name,
      currencySymbol,
      originalPrice: bargainSession.originalPrice,
      minPrice,
      attemptsUsed: bargainSession.attemptsUsed,
      maxAttempts: config.maxAttempts,
      persona: config.aiPersona as NegotiationContext['persona'],
    }

    // Convert DB messages to negotiator history
    const history = bargainSession.messages
      .filter(m => m.role === 'customer' || m.role === 'ai')
      .map(m => ({
        role: (m.role === 'customer' ? 'customer' : 'ai') as 'customer' | 'ai',
        content: m.content,
        offeredPrice: m.offeredPrice ?? undefined,
      }))

    const result = await negotiateStep(ctx, history, data.offer)
    const attemptsUsed = bargainSession.attemptsUsed + 1
    const attemptsRemaining = Math.max(0, config.maxAttempts - attemptsUsed)

    // Transaction: persist customer offer + AI reply + update session
    const [customerMsg, aiMsg, updatedSession] = await prisma.$transaction([
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id,
          role: 'customer',
          content: `I'll offer ${currencySymbol}${data.offer.toFixed(2)}`,
          offeredPrice: data.offer,
        },
      }),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id,
          role: 'ai',
          content: result.reply,
          offeredPrice: result.counterOffer ?? null,
          metadata: {
            decision: result.decision,
            tactic: result.tactic,
            sentiment: result.sentiment,
            ...(result.metadata ?? {}),
          } as any,
        },
      }),
      prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: {
          attemptsUsed,
          currentOffer: data.offer,
          status:
            result.decision === 'accept' ? 'accepted' :
            result.decision === 'reject' ? 'rejected' : 'active',
          finalPrice: result.decision === 'accept' ? (result.counterOffer ?? data.offer) : null,
        },
      }),
    ])

    return NextResponse.json({
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer ?? null,
      attemptsRemaining,
      sessionStatus: updatedSession.status,
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
