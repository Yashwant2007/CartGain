import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainOfferSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { negotiateStep, ruleBasedDecision, buildOpeningMessage, buildCustomerContext, computeMinPrice, retentionOffer, type NegotiationContext } from '@/lib/services/bargain'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ── Walkout detection: does the customer threaten to leave / close the deal? ──
function detectWalkout(text: string): boolean {
  const t = text.toLowerCase()

  // "leaving for work/school" etc. — NOT a walkout
  if (/(?:leaving|going|out|step\s+away)\s+(?:for|to)\s+(?:work|office|school|gym|dinner|lunch|break|class)/.test(t)) {
    return false
  }

  const strong = [
    /(?:i'?m|i am)\s+(?:out|gone|done|leaving|heading\s+out)/,
    /forget\s+it/i,
    /never\s+mind/i,
    /change\s+my\s+mind/i,
    /walk(?:ing)?\s+away/i,
    /(?:going|heading)\s+(?:elsewhere|somewhere\s+else)/,
    /(?:buy|purchase|get|shop)\s+(?:it\s+)?(?:from|at)\s+another/i,
    /not\s+(?:interested|buying)\s+anymore/i,
    /(?:no|skip|drop)\s+the\s+deal/i,
    /\b(?:bye|goodbye|good\s+bye)\b/i,
    /(?:eff|screw)\s+this|give\s+up/i,
    /too\s+expensive,?\s+(?:i'?m|i)\s+(?:leaving|going|out)/i,
  ]
  if (strong.some(r => r.test(t))) return true

  // Price complaint + exit intent combined
  if (/(?:too\s+expensive|rip\s*off|overpriced|high\s+price|can'?t\s+afford)/.test(t)
    && /(?:leave|go|walk|out|away|elsewhere|another\s+store|amazon|flipkart|meesho)/.test(t)) {
    return true
  }

  // "I'll take my business elsewhere"
  if (/(?:take|bring)\s+my\s+(?:business|money)/.test(t)
    && /(?:elsewhere|another|away|somewhere\s+else)/.test(t)) {
    return true
  }

  return false
}

// ── Bulk quantity extraction: how many units does the customer want? ──
function extractQuantity(text: string): number | null {
  const t = text.trim()

  if (/(?:half\s+dozen)/i.test(t)) return 6
  if (/(?:dozen)/i.test(t)) return 12

  const patterns = [
    // explicit unit words: "2 units", "5 pieces", "3 qty", "4 pcs", "10 items"
    /(\d{1,3})\s*(?:pieces?|units?|items?|qty\.?|pcs\.?|nos\.?|numbers?|copies?)\b/i,
    // "qty: 5", "quantity 5"
    /(?:qty|quantity)\s*[:=]?\s*(\d{1,3})\b/i,
    // "2 of these/them/those"
    /(\d{1,3})\s+of\s+(?:these|them|those|this|it)\b/i,
    // bare "buy 3 / take 5 / want 10 / need 2 / order 4" — only small numbers to avoid price confusion
    /(?:buy|take|want|need|get|order|purchase|grabbing)\s+(?:about\s+|around\s+)?(\d{1,2})\b/i,
    // "3x" / "3 x" multiplier
    /(\d{1,2})\s*[x×]\b/i,
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n >= 2 && n <= 100) return n
  }

  // Bare "take N" — only when N is small (2-20) and no currency symbol anywhere
  const bare = t.match(/(?:buy|take|want|need|get|order)\s+(?:about\s+|around\s+)?(\d{1,2})\b/)
  if (bare) {
    const n = parseInt(bare[1], 10)
    if (n >= 2 && n <= 20 && !/\b(?:₹|rs\.?|inr|\$|usd|€|eur|euros?|rupees?|dollars?)\s*\d|\d\s*(?:₹|rs\.?|inr|\$|usd|€|eur|euros?|rupees?|dollars?)\b/i.test(t)) {
      return n
    }
  }
  return null
}

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
    const rate = await checkSimpleRateLimit(`bargain_offer_${request.headers.get('x-forwarded-for') || 'unknown'}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const data = validateOrThrow(bargainOfferSchema, body)
    const customerOffer = extractPrice(data.message)
    const isWalkout = detectWalkout(data.message)

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

    // Resolve bulk quantity: from this message, or carry over the last known one
    const lastBulk = [...bargainSession.messages].reverse()
      .find((m: any) => (m.metadata as any)?.bulkQuantity)
    const bulkQuantity = extractQuantity(data.message) ?? (lastBulk?.metadata as any)?.bulkQuantity ?? null

    // Has the customer already received a walkout retention offer?
    const hadRetention = bargainSession.messages.some(
      (m: any) => (m.metadata as any)?.tactic === 'walkout_retention'
    )

    // Compute floor price (bulk-aware; reuses shared computeMinPrice with proper defaults)
    const { minPrice } = await computeMinPrice({
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      originalPrice: bargainSession.originalPrice,
      bulkQuantity: bulkQuantity ?? undefined,
    })
    // Fetch product title separately (not part of computeMinPrice)
    const productTitle = await (async () => {
      const p = await prisma.bargainProduct.findUnique({
        where: { storeId_shopifyProductId: { storeId: bargainSession.storeId, shopifyProductId: bargainSession.shopifyProductId } },
        select: { productTitle: true },
      })
      return p?.productTitle ?? undefined
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
      bulkQuantity: bulkQuantity ?? undefined,
      walkoutTriggered: isWalkout,
      customerContext: await buildCustomerContext(bargainSession.storeId, bargainSession.customerEmail),
    }

    const history = bargainSession.messages
      .filter((m: any) => m.role === 'customer' || m.role === 'ai')
      .map((m: any) => ({
        role: (m.role === 'customer' ? 'customer' : 'ai') as 'customer' | 'ai',
        content: m.content,
        offeredPrice: m.offeredPrice ?? undefined,
      }))

    // ── WALKOUT HANDLING ──
    if (isWalkout) {
      // Last known AI counter (most recent ai message with offeredPrice)
      const lastCounter = [...bargainSession.messages].reverse()
        .find((m: any) => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null

      if (hadRetention || attemptsRemaining <= 0) {
        // Second walkout OR no attempts left → close the session (abandoned)
        const farewellReplies = {
          friendly_shopkeeper: 'I understand, friend. The door\'s always open if you change your mind. Take care! 👋',
          strict_negotiator: 'Understood. This negotiation is closed. You may start a new session anytime.',
          playful_friend: 'Aw, really? 😅 Well, if you change your mind, you know where I am! No hard feelings 🙌',
        } as Record<string, string>
        const farewell = farewellReplies[ctx.persona] ?? farewellReplies.friendly_shopkeeper
        await prisma.$transaction([
          prisma.bargainMessage.create({
            data: { sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null },
          }),
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'ai', content: farewell,
              metadata: { tactic: 'walkout_final', reason: hadRetention ? 'second_walkout' : 'no_attempts_left' } as any,
            },
          }),
          prisma.bargainSession.update({
            where: { id: bargainSession.id },
            data: { status: 'abandoned', currentOffer: customerOffer ?? bargainSession.currentOffer },
          }),
        ])
        return NextResponse.json({
          reply: farewell,
          decision: 'reject',
          attemptsRemaining,
          sessionStatus: 'abandoned',
          terminal: true,
        })
      }

      // First walkout → retention offer (one meaningful extra concession)
      const retentionResult = await negotiateStep(ctx, history, data.message, customerOffer ?? undefined)
      const retentionPrice = retentionResult.counterOffer ?? retentionOffer(ctx, lastCounter).counterOffer ?? minPrice
      const retentionReply = retentionResult.reply || retentionOffer(ctx, lastCounter).reply

      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'customer', content: data.message,
            offeredPrice: customerOffer ?? null,
            metadata: { bulkQuantity } as any,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: retentionReply,
            offeredPrice: retentionPrice,
            metadata: { decision: 'counter', tactic: 'walkout_retention', sentiment: 'urgent' } as any,
          },
        }),
        prisma.bargainSession.update({
          where: { id: bargainSession.id },
          data: { currentOffer: customerOffer ?? bargainSession.currentOffer },
        }),
      ])
      return NextResponse.json({
        reply: retentionReply,
        decision: 'counter',
        counterOffer: retentionPrice,
        attemptsRemaining,
        sessionStatus: 'active',
        sessionId: bargainSession.id,
      })
    }

    // ── NORMAL NEGOTIATION (incl. bulk) ──
    const result = await negotiateStep(ctx, history, data.message, customerOffer ?? undefined)

    const sessionStatus =
      result.decision === 'accept' ? 'accepted' :
      result.decision === 'reject' ? 'rejected' : 'active'

    const [customerMsg, aiMsg, updatedSession] = await prisma.$transaction([
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id, role: 'customer', content: data.message,
          offeredPrice: customerOffer ?? null,
          metadata: bulkQuantity ? { bulkQuantity } as any : undefined,
        },
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
