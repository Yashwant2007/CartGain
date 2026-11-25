import { NextRequest, NextResponse } from 'next/server'
import {
  chatFallback,
  classifySeriousness,
  detectFloorLeak,
  detectMetaFloorTalk,
  detectPercentFloorLeak,
  negotiateStep,
  ruleBasedDecision,
  type NegotiationContext,
} from '@/lib/services/bargain'
import { deriveConversationState } from '@/lib/bargain/conversation-state'
import { analyzeIntent } from '@/lib/bargain/intent'
import { analyzeLiveTurn } from '@/lib/bargain/live-turn'
import { detectLanguage } from '@/lib/bargain/language'
import { extractPrice, normalizeCustomerText } from '@/lib/bargain/text'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const SAMPLE_PRODUCT = {
  id: 'home-demo-serum',
  title: 'Vitamin C Brightening Serum',
  image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop',
  basePrice: 1499,
  merchantPrice: 1299,
  floorPrice: 1100,
  currencySymbol: '₹',
}

const PUBLIC_PRODUCT = {
  id: SAMPLE_PRODUCT.id,
  title: SAMPLE_PRODUCT.title,
  image: SAMPLE_PRODUCT.image,
  basePrice: SAMPLE_PRODUCT.basePrice,
  merchantPrice: SAMPLE_PRODUCT.merchantPrice,
  currencySymbol: SAMPLE_PRODUCT.currencySymbol,
}

const FLOOR_SAFE_REPLY = 'I only quote a price I can honor — give me a number that works for you.'
const MAX_ATTEMPTS = 3
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    const rate = await checkSimpleRateLimit(`bargain_home_demo_${ip}`)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many demo requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
      )
    }

    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 500) : ''
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

    const interpretedMessage = normalizeCustomerText(message)
    const intent = analyzeIntent(interpretedMessage)
    const extracted = intent.offersPriceSignal ? extractPrice(interpretedMessage) : null
    const offer = extracted != null
      ? Math.round(clamp(extracted, 0, SAMPLE_PRODUCT.merchantPrice) * 100) / 100
      : null

    const history = Array.isArray(body.history)
      ? body.history.slice(-12).map((m: any) => ({
          role: (m?.role === 'ai' ? 'ai' : 'customer') as 'customer' | 'ai',
          content: typeof m?.content === 'string' ? m.content.slice(0, 500) : '',
          offeredPrice: typeof m?.offeredPrice === 'number' ? clamp(m.offeredPrice, 0, 1_000_000) : undefined,
        })).filter((m: { content: string }) => m.content.length > 0)
      : []

    const attemptsUsed = Math.round(clamp(typeof body.attemptsUsed === 'number' ? body.attemptsUsed : 0, 0, MAX_ATTEMPTS - 1)) + 1
    const priorOffers = history
      .filter((m) => m.role === 'customer' && typeof m.offeredPrice === 'number')
      .map((m) => m.offeredPrice as number)
    const lastOffer = priorOffers[priorOffers.length - 1]
    const customerOfferTrend = offer == null || lastOffer == null
      ? undefined
      : offer > lastOffer ? 'rising' : offer < lastOffer ? 'falling' : 'flat'

    const language = detectLanguage(interpretedMessage) ?? 'en'
    const liveTurn = analyzeLiveTurn({
      message: interpretedMessage,
      intent: intent.intent,
      customerOffer: offer,
      repeatedMessage: false,
    })

    const ctx: NegotiationContext = {
      storeName: 'Lumina Beauty',
      currencySymbol: SAMPLE_PRODUCT.currencySymbol,
      originalPrice: SAMPLE_PRODUCT.merchantPrice,
      minPrice: SAMPLE_PRODUCT.floorPrice,
      attemptsUsed,
      maxAttempts: MAX_ATTEMPTS,
      persona: 'friendly_shopkeeper' as const,
      shopkeeperPersonality: 'friendly_shopkeeper' as const,
      productTitle: SAMPLE_PRODUCT.title,
      customerContext: 'Public homepage demo using a fixed sample product.',
      language,
      intent,
      liveTurn,
      customerOfferTrend,
      recommendationsEnabled: false,
      abuseStrictness: 'standard' as const,
    }
    ctx.seriousness = classifySeriousness(history, interpretedMessage, ctx, 0)
    ctx.lastCounter = [...history].reverse()
      .find((m) => m.role === 'ai' && typeof m.offeredPrice === 'number')?.offeredPrice ?? null

    let result
    try {
      result = await negotiateStep(ctx, history, interpretedMessage, offer ?? undefined, 'home_demo')
    } catch {
      result = offer != null
        ? ruleBasedDecision(offer, ctx)
        : { reply: chatFallback(interpretedMessage, ctx, history.length), decision: 'chat' as const, tactic: 'home_demo_fallback', sentiment: 'neutral' }
    }

    const leakedFloor =
      detectFloorLeak(result.reply, SAMPLE_PRODUCT.floorPrice, SAMPLE_PRODUCT.merchantPrice) ||
      detectPercentFloorLeak(result.reply, SAMPLE_PRODUCT.floorPrice, SAMPLE_PRODUCT.merchantPrice) ||
      detectMetaFloorTalk(result.reply)
    const reply = leakedFloor ? FLOOR_SAFE_REPLY : result.reply
    const decision = leakedFloor && result.decision === 'accept' ? ('counter' as const) : result.decision
    const counterOffer = leakedFloor && result.decision === 'accept' ? null : result.counterOffer ?? null

    const conversationState = deriveConversationState({
      attemptsUsed,
      walkoutTriggered: false,
      dealAccepted: decision === 'accept',
      intent: intent.intent,
      objection: intent.objection,
      offersPriceSignal: intent.offersPriceSignal,
      recommendationsEnabled: false,
    })

    return NextResponse.json({
      reply,
      decision,
      counterOffer,
      offer,
      offerDetected: offer != null,
      attemptsUsed: Math.min(MAX_ATTEMPTS, attemptsUsed),
      conversationState,
      product: PUBLIC_PRODUCT,
    })
  } catch (error) {
    console.error('[BARGAIN_HOME_DEMO]', error)
    return NextResponse.json({ error: 'Demo unavailable' }, { status: 500 })
  }
}
