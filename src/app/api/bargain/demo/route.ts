import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import {
  negotiateStep,
  ruleBasedDecision,
  buildOpeningMessage,
  SUPPORTED_LANGUAGES,
  type Persona,
  type NegotiationContext,
  type NegotiationResult,
} from '@/lib/services/bargain'
import { detectLanguage } from '@/lib/bargain/language'

export const dynamic = 'force-dynamic'

// POST /api/bargain/demo — OpenAI-powered negotiation for the interactive
// demos (/demo and /s/bargain). Sign-in required; the demos themselves are
// one-time per account (enforced by the pages). Clients keep the session
// history and replay it so this endpoint stays stateless.
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const VALID_PERSONAS: Persona[] = ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend']

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const rate = await checkSimpleRateLimit(`bargain_demo_${session.user.id}`)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many demo requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
      )
    }

    const body = await request.json()

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''
    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    const originalPrice = typeof body.originalPrice === 'number' ? clamp(body.originalPrice, 1, 1_000_000) : 1000
    let minPrice = typeof body.minPrice === 'number' ? clamp(body.minPrice, 1, originalPrice) : originalPrice * 0.75
    minPrice = Math.min(minPrice, originalPrice)

    const maxAttempts = Math.round(clamp(typeof body.maxAttempts === 'number' ? body.maxAttempts : 3, 1, 10))
    const attemptsUsed = Math.round(clamp(typeof body.attemptsUsed === 'number' ? body.attemptsUsed : 0, 0, maxAttempts))

    const persona: Persona = VALID_PERSONAS.includes(body.persona) ? body.persona : 'friendly_shopkeeper'
    const language = typeof body.language === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(body.language.toLowerCase())
      ? body.language.toLowerCase()
      : 'auto'
    // Auto = speak the customer's language. Detect from their latest message and
    // hand the engine an explicit language so the reply mirror is reliable.
    const effectiveLanguage = language !== 'auto' ? language : (detectLanguage(message) ?? 'auto')

    const storeName = typeof body.storeName === 'string' ? body.storeName.slice(0, 60) : 'Lumina Beauty'
    const productTitle = typeof body.productTitle === 'string' ? body.productTitle.slice(0, 120) : undefined
    const currencySymbol = typeof body.currencySymbol === 'string' ? body.currencySymbol.slice(0, 4) : '₹'
    const bulkQuantity = typeof body.bulkQuantity === 'number' ? Math.round(clamp(body.bulkQuantity, 2, 1000)) : undefined

    let offer: number | null = typeof body.offer === 'number' ? body.offer : null
    if (offer != null) {
      offer = clamp(offer, 0, originalPrice)
    }

    // Normalize + bound the replay history
    const history = Array.isArray(body.history)
      ? body.history.slice(-12).map((m: any) => ({
          role: (m?.role === 'ai' ? 'ai' : 'customer') as 'customer' | 'ai',
          content: typeof m?.content === 'string' ? m.content.slice(0, 500) : '',
          offeredPrice: typeof m?.offeredPrice === 'number' ? clamp(m.offeredPrice, 0, 1_000_000) : undefined,
        })).filter((m: { content: string }) => m.content.length > 0)
      : []

    const ctx: NegotiationContext = {
      storeName,
      currencySymbol,
      originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts,
      persona,
      productTitle,
      bulkQuantity,
      language: effectiveLanguage,
      walkoutTriggered: body.walkoutTriggered === true,
      customerContext: 'Sequential guided product demo on the CartGain site.',
    }

    let result: NegotiationResult
    try {
      result = await negotiateStep(ctx, history, message, offer ?? undefined, `demo_${session.user.id}`)
    } catch {
      result = offer != null
        ? ruleBasedDecision(offer, ctx)
        : { reply: buildOpeningMessage(ctx), decision: 'chat', counterOffer: minPrice, tactic: 'demo_fallback', sentiment: 'neutral' }
    }

    return NextResponse.json({
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer ?? null,
      tactic: result.tactic ?? 'conversational',
      sentiment: result.sentiment ?? 'neutral',
      abuse: (result.metadata as any)?.abuse === true,
    })
  } catch (err: any) {
    console.error('[BARGAIN_DEMO]', err?.message ?? err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}