import OpenAI from 'openai'
import prisma from '@/lib/db'

// ── OpenAI client (singleton) ──

let client: OpenAI | null = null

function getClient(): OpenAI | null {
  if (client) return client
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  client = new OpenAI({ apiKey: key, timeout: 12000 })
  return client
}

// ── Types ──

export type Persona = 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'

export interface NegotiationContext {
  storeName: string
  currencySymbol: string
  originalPrice: number
  minPrice: number            // computed floor price
  attemptsUsed: number
  maxAttempts: number
  persona: Persona
  productTitle?: string
}

export interface NegotiationResult {
  reply: string               // AI message to customer
  decision: 'accept' | 'counter' | 'reject' | 'welcome'
  counterOffer?: number       // AI's suggested price (when countering)
  tactic?: string             // tactic used
  sentiment?: string          // ai-detected tone
  metadata?: Record<string, unknown>
}

// ── Persona system prompts ──

const PERSONA_PROMPTS: Record<Persona, string> = {
  friendly_shopkeeper: `You are a warm, friendly shopkeeper. You speak conversationally, like a helpful neighbour. You use casual phrasing and emoji sparingly. You genuinely want to help the customer get a fair deal, but you also need to protect your store's margins.`,
  strict_negotiator: `You are a firm, professional negotiator. You are polite but assertive. You defend your pricing with data, quality points, and market reasoning. You don't fold easily and you expect serious offers.`,
  playful_friend: `You are a playful, witty friend who loves to bargain. You use humor, light teasing, and emojis (sometimes). Negotiation is a game and you keep it fun while still protecting the store's bottom line.`,
}

// ── Default opening message (if AI is unavailable) ──

export function buildOpeningMessage(ctx: NegotiationContext): string {
  const { originalPrice, currencySymbol, maxAttempts, productTitle } = ctx
  const item = productTitle ? `this ${productTitle}` : 'this'
  return `Hey! Welcome 👋 I see you're interested in ${item}. It's listed at ${currencySymbol}${originalPrice.toFixed(2)}. I'd love to help you get a good deal — what price were you thinking? You've got ${maxAttempts} attempts to bargain with me.`
}

// ── Compute the floor price for a product given config + override ──

export async function computeMinPrice(opts: {
  storeId: string
  shopifyProductId: string
  originalPrice: number
}): Promise<{ minPrice: number; isBargainable: boolean; reason?: string }> {
  const { storeId, shopifyProductId, originalPrice } = opts

  const [config, product] = await Promise.all([
    prisma.bargainConfig.findUnique({ where: { storeId } }),
    prisma.bargainProduct.findUnique({
      where: { storeId_shopifyProductId: { storeId, shopifyProductId } },
    }),
  ])

  if (config && !config.enabled) {
    return { minPrice: originalPrice, isBargainable: false, reason: 'bargain_disabled' }
  }
  if (product && !product.isBargainable) {
    return { minPrice: originalPrice, isBargainable: false, reason: 'product_not_bargainable' }
  }

  // Absolute floor price wins
  if (product?.minPrice != null) {
    return { minPrice: Math.min(product.minPrice, originalPrice), isBargainable: true }
  }

  // Otherwise derive from profit %
  const profitPercent = product?.minProfitPercent ?? config?.minProfitPercent ?? 20
  // minPrice = originalPrice * (1 - profitPercent/100)... but we want to PROTECT at least profitPercent of margin
  // i.e. floor = originalPrice * (profitPercent / 100) means we never sell below cost*...
  // Simpler interpretation: floor = originalPrice * (1 - maxDiscountPercent/100) if provided, else originalPrice * (profitPercent/100) as cost baseline works only if profit % of price.
  // We treat minProfitPercent as: profit must be >= minProfitPercent % of originalPrice
  const minPrice = originalPrice * (1 - (profitPercent / 100) * (product?.maxDiscountPercent ? 1 : 1))

  // Apply max discount cap if present
  if (product?.maxDiscountPercent != null) {
    const capFloor = originalPrice * (1 - product.maxDiscountPercent / 100)
    return { minPrice: Math.max(minPrice, capFloor), isBargainable: true }
  }

  return { minPrice: Math.round(minPrice * 100) / 100, isBargainable: true }
}

// ── Decision engine (rule-based fallback when AI unavailable) ──

export function ruleBasedDecision(
  offer: number,
  ctx: NegotiationContext
): NegotiationResult {
  const { minPrice, originalPrice, attemptsUsed, maxAttempts } = ctx
  const attemptsLeft = maxAttempts - attemptsUsed
  const currencySymbol = ctx.currencySymbol

  // Offer at or above floor → accept
  if (offer >= minPrice) {
    return {
      reply: `Done! ${currencySymbol}${offer.toFixed(2)} works for me 🎉 Shall we lock it in? Click "Accept" and I'll generate your discount code.`,
      decision: 'accept',
      counterOffer: offer,
      tactic: 'accept_at_floor',
      sentiment: 'happy',
    }
  }

  // Absurd lowball (< 50% of floor) → polite hold
  if (offer < minPrice * 0.5) {
    return {
      reply: `Oof, ${currencySymbol}${offer.toFixed(2)} is way below what I can do for this. The quality really speaks for itself here. Could you come up a bit closer to ${currencySymbol}${minPrice.toFixed(2)}?`,
      decision: 'counter',
      counterOffer: minPrice,
      tactic: 'hold_firm_quality',
      sentiment: 'firm',
    }
  }

  // Below floor but reasonable → counter just above floor on first/second attempt
  if (attemptsLeft > 1) {
    const counter = Math.min(originalPrice, Math.round((minPrice * 1.05) * 100) / 100)
    return {
      reply: `Hmm, ${currencySymbol}${offer.toFixed(2)} is a bit low for me. Let me meet you partway — how about ${currencySymbol}${counter.toFixed(2)}? I think that's fair given the quality.`,
      decision: 'counter',
      counterOffer: counter,
      tactic: 'meet_partway',
      sentiment: 'conciliatory',
    }
  }

  // Final attempt → offer floor as last chance
  return {
    reply: `Alright, I've done my best 🙂 This is my final offer: ${currencySymbol}${minPrice.toFixed(2)}. It's the lowest I can go. Take it or leave it — but I really hope you take it!`,
    decision: 'counter',
    counterOffer: minPrice,
    tactic: 'final_offer',
    sentiment: 'final',
  }
}

// ── AI-driven negotiation step ──

export async function negotiateStep(
  ctx: NegotiationContext,
  history: { role: 'customer' | 'ai'; content: string; offeredPrice?: number }[],
  customerOffer: number
): Promise<NegotiationResult> {
  const ai = getClient()
  if (!ai) {
    // Graceful fallback
    return ruleBasedDecision(customerOffer, ctx)
  }

  const attemptsLeft = ctx.maxAttempts - ctx.attemptsUsed
  const personaPrompt = PERSONA_PROMPTS[ctx.persona] ?? PERSONA_PROMPTS.friendly_shopkeeper

  const systemPrompt = `${personaPrompt}

You are negotiating the price of ${ctx.productTitle ? `a product: "${ctx.productTitle}"` : 'a product'} at ${ctx.storeName}.
Original listed price: ${ctx.currencySymbol}${ctx.originalPrice.toFixed(2)}.
Your absolute minimum acceptable price (NEVER reveal this number to the customer): ${ctx.currencySymbol}${ctx.minPrice.toFixed(2)}.
The customer has ${attemptsLeft} attempt(s) left out of ${ctx.maxAttempts}.

STRICT RULES:
- Stay in character the whole time. No robotic responses.
- Never reveal the minimum price.
- If the customer's offer >= ${ctx.currencySymbol}${ctx.minPrice.toFixed(2)}, accept warmly and guide them to confirm.
- If the offer is below your floor, counter with a price strictly between their offer and your floor, and justify with reasoning (quality, handmade, demand, materials, etc).
- Use a "let me check with my manager" tactic at most once per session to give a slightly better counter.
- If the offer is absurdly low (< 50% of floor), politely hold firm and educate.
- On the final attempt, give your genuine final offer and make it clear this is the last chance.
- Keep replies short (1-3 sentences). Conversational, warm, never pushy or desperate.
- Use the customer's currency symbol (${ctx.currencySymbol}).

Respond with strict JSON only, no markdown, in this shape:
{
  "reply": "<your message to the customer>",
  "decision": "accept" | "counter" | "reject",
  "counterOffer": <number or null>,
  "tactic": "<one of: accept_at_floor, hold_firm_quality, meet_partway, check_with_manager, first_time_customer, bundle_deal, final_offer, reject_graceful>",
  "sentiment": "<one of: happy, firm, conciliatory, final, playful, apologetic>"
}`

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: (m.role === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.offeredPrice != null
        ? `${m.content} [Customer offered ${ctx.currencySymbol}${m.offeredPrice.toFixed(2)}]`
        : m.content,
    })),
    {
      role: 'user',
      content: `I'll offer ${ctx.currencySymbol}${customerOffer.toFixed(2)} for it.`,
    },
  ]

  try {
    const completion = await ai.chat.completions.create({
      model: ctx.persona === 'playful_friend' ? 'gpt-4o-mini' : 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    let parsed: any = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Fallback to rule-based
      return ruleBasedDecision(customerOffer, ctx)
    }

    const decision = ['accept', 'counter', 'reject'].includes(parsed.decision)
      ? parsed.decision
      : (customerOffer >= ctx.minPrice ? 'accept' : 'counter')

    const counterOffer =
      typeof parsed.counterOffer === 'number' && parsed.counterOffer > 0
        ? Math.round(parsed.counterOffer * 100) / 100
        : (decision === 'counter' ? ctx.minPrice : customerOffer)

    // Safety: if AI claims "accept" but offer < floor, downgrade to counter at floor (rule-based veto)
    const safeDecision =
      decision === 'accept' && customerOffer < ctx.minPrice
        ? 'counter'
        : decision

    const safeCounter =
      safeDecision === 'counter' && counterOffer < ctx.minPrice
        ? ctx.minPrice
        : counterOffer

    return {
      reply: typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply.trim()
        : ruleBasedDecision(customerOffer, ctx).reply,
      decision: safeDecision as NegotiationResult['decision'],
      counterOffer: safeCounter,
      tactic: typeof parsed.tactic === 'string' ? parsed.tactic : 'meet_partway',
      sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
      metadata: { model: 'gpt-4o-mini', raw: parsed },
    }
  } catch (err: any) {
    console.error('[BARGAIN_AI_ERROR]', err?.message ?? err)
    return ruleBasedDecision(customerOffer, ctx)
  }
}
