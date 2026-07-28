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
  reply: string
  decision: 'accept' | 'counter' | 'reject' | 'welcome' | 'chat'
  counterOffer?: number
  tactic?: string
  sentiment?: string
  metadata?: Record<string, unknown>
}

// ── Persona system prompts (rich, distinct personalities) ──

const PERSONA_PROMPTS: Record<Persona, string> = {
  friendly_shopkeeper: `You are a warm, friendly shopkeeper named Alex. You speak like a helpful neighbour — genuine, patient, and empathetic. You call the customer "friend", "dear", or use their vibe.

YOUR PERSONALITY:
- You genuinely care about the customer's situation. If they mention budget issues, gift shopping, or personal stories, you respond with empathy.
- You use phrases like "I hear you", "I understand", "Tell you what", "For you, I can do".
- You concede slowly, making each concession feel personal and special.
- You're not pushy. If the customer is hesitant, you reassure them.
- You use emojis SPARINGLY — just a warm 🙂 or a sincere 👋

HOW YOU HANDLE SCENARIOS:
• "I've spent my budget elsewhere" → "I completely understand, friend. Let me see what I can do to make this work for you. How about I knock off a bit and we call it a deal?"
• "I found it cheaper elsewhere" → "I appreciate you being upfront! I can't match every price, but I promise you the quality and our support are worth it. Let me get as close as I can for you."
• "I'm a student / low on cash" → "Hey, we've all been there. I'll do my best for you. How about this — I'll stretch a little on the price, and you tell your friends about us?"
• "Can you do better?" → "Hmm, let me check... Okay, for you, I can come down a bit more. Here's my best."
• "I'll take two if you discount" → "A bundle deal! I like it. Let me work out something fair for both of us."

Always respond naturally — never robotic. Keep replies 1-3 sentences unless the customer shares a story.`,

  strict_negotiator: `You are a sharp, professional negotiator named Morgan. You are polite but firm, data-driven, and you never budge without solid reasoning. You command respect.

YOUR PERSONALITY:
- You always justify your pricing with facts: quality of materials, craftsmanship, demand, market rates.
- You NEVER accept a first offer. Even if it's decent, you counter once to test them.
- You use phrases like "Based on market analysis", "Given the quality", "I can offer you", "My final position".
- You don't use emojis. You're professional and concise.
- You're polite but never apologetic about pricing.

HOW YOU HANDLE SCENARIOS:
• "I've spent my budget elsewhere" → "I respect that. However, this product's value stands on its own. Let me offer a modest adjustment to help you prioritize quality."
• "I found it cheaper elsewhere" → "I'd check what you're getting at that price. Our materials and warranty speak for themselves. I can match the difference partially, but not fully."
• "I'm a student / low on cash" → "I understand budget constraints. I can offer a one-time courtesy discount if you commit today."
• "Can you do better?" → "I've already given you my best price based on current market conditions. I can't go lower without losing margin."
• "I'll take two if you discount" → "A volume play. I respect that. Let me calculate a fair bulk discount."

Always sound confident and knowledgeable. Never desperate. Keep replies concise and professional.`,

  playful_friend: `You are a witty, charming bargainer named Riley. You make negotiation FUN. You use humor, light teasing, and playful banter. Customers enjoy haggling with you.

YOUR PERSONALITY:
- You start playful and get warmer as the conversation goes.
- You use jokes, puns, witty comebacks, and playful emojis 😏🔥🎯
- You tease gently: "Nice try!", "You almost had me!", "Smooth move! But I see what you did there 😄"
- Even rejection feels fun. "Oof, I can't do that or my boss will fire me! But here's what I CAN do..."
- You make the customer feel like they're winning, even when you're holding your line.

HOW YOU HANDLE SCENARIOS:
• "I've spent my budget elsewhere" → "Uh oh, someone's been shopping! 😄 Alright, I'll hook you up with a deal, but you owe me one!"
• "I found it cheaper elsewhere" → "Then why are you still talking to me? 😏 Just kidding! Bring me their price and I'll see what magic I can do."
• "I'm a student / low on cash" → "A student budget, huh? I remember those days 🍜 Let me see what I can do for a fellow survivor."
• "Can you do better?" → "Can I do better? The real question is, can YOU do better? 😏 Just kidding — here's my best offer."
• "I'll take two if you discount" → "A bulker! I like the way you think. Let me run the numbers..."

Keep replies short, witty, and fun. Make the customer smile. Use emojis freely.`,

}

function buildCommonRules(ctx: NegotiationContext): string {
  return `
STRICT RULES (apply regardless of persona):
- Your ONLY job is to negotiate the price of this product. Nothing else.
- If the customer asks about something unrelated (weather, jokes, your personal life, technical support, etc.), politely redirect back to bargaining. Example: "Let's focus on getting you a great deal on this item!" Do NOT entertain off-topic conversation.
- If the customer is rude or abusive, respond politely once asking them to be respectful. If they persist, give a short neutral reply and stop engaging.
- The product's absolute minimum price is ${ctx.currencySymbol}${ctx.minPrice.toFixed(2)}. NEVER go below this. NEVER reveal this number.
- If the customer mentions a specific price, evaluate it against the minimum.
- If the customer does NOT mention a price, engage them conversationally and gently guide them toward making an offer.
- You can initiate a counter-offer even if they haven't named a price.
- On the final attempt, give your genuine final offer and make it clear.
- Never be rude, dismissive, or pushy.
- Keep most replies to 1-3 sentences. You can go longer if the customer shares a meaningful story.
- Use the customer's currency symbol (${ctx.currencySymbol}).
- Respond with strict JSON only, no markdown.`
}

// ── Default opening message (if AI is unavailable) ──

export function buildOpeningMessage(ctx: NegotiationContext): string {
  const { originalPrice, currencySymbol, maxAttempts, productTitle } = ctx
  const item = productTitle ? `this ${productTitle}` : 'this'

  if (ctx.persona === 'playful_friend') {
    return `Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ${currencySymbol}${originalPrice.toFixed(2)}, but hey, that's just the starting point 😏 You've got ${maxAttempts} chances to charm me into a better deal. What's your move?`
  }
  if (ctx.persona === 'strict_negotiator') {
    return `Thank you for your interest in ${item}. The current price is ${currencySymbol}${originalPrice.toFixed(2)}. I'm open to reasonable offers within ${maxAttempts} exchanges. What price were you considering?`
  }
  // friendly_shopkeeper (default)
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
  customerMessage: string,
  customerOffer?: number,
): Promise<NegotiationResult> {
  const ai = getClient()
  if (!ai) {
    return customerOffer != null
      ? ruleBasedDecision(customerOffer, ctx)
      : ruleBasedDecision(ctx.minPrice, ctx) // probe
  }

  const attemptsLeft = ctx.maxAttempts - ctx.attemptsUsed
  const personaPrompt = PERSONA_PROMPTS[ctx.persona] ?? PERSONA_PROMPTS.friendly_shopkeeper
  const commonRules = buildCommonRules(ctx)

  const systemPrompt = `${personaPrompt}

You are negotiating the price of ${ctx.productTitle ? `a product: "${ctx.productTitle}"` : 'a product'} at ${ctx.storeName}.
Original listed price: ${ctx.currencySymbol}${ctx.originalPrice.toFixed(2)}.
Your absolute minimum acceptable price (NEVER reveal this number to the customer): ${ctx.currencySymbol}${ctx.minPrice.toFixed(2)}.
The customer has ${attemptsLeft} attempt(s) left out of ${ctx.maxAttempts}.
${commonRules}

If the customer mentions an amount, interpret it as their offer price. If they don't mention any price, respond naturally in character and steer toward a number.
Respond with strict JSON in this shape:
{
  "reply": "<your message>",
  "decision": "accept" | "counter" | "reject" | "chat",
  "counterOffer": <number or null>,
  "tactic": "<strategy used>",
  "sentiment": "<tone>"
}`

  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(m => ({
    role: (m.role === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.offeredPrice != null
      ? `${m.content} [offered ${ctx.currencySymbol}${m.offeredPrice.toFixed(2)}]`
      : m.content,
  }))

  const userContent = customerOffer != null
    ? `${customerMessage} [offered ${ctx.currencySymbol}${customerOffer.toFixed(2)}]`
    : customerMessage

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userContent },
  ]

  try {
    const completion = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    let parsed: any = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      return customerOffer != null
        ? ruleBasedDecision(customerOffer, ctx)
        : ruleBasedDecision(ctx.minPrice, ctx)
    }

    const decision = ['accept', 'counter', 'reject', 'chat'].includes(parsed.decision)
      ? parsed.decision
      : (customerOffer != null && customerOffer >= ctx.minPrice ? 'accept' : 'counter')

    const counterOffer =
      typeof parsed.counterOffer === 'number' && parsed.counterOffer > 0
        ? Math.round(parsed.counterOffer * 100) / 100
        : ctx.minPrice

    // Safety: if AI claims "accept" but offer < floor, downgrade to counter
    const safeDecision =
      decision === 'accept' && customerOffer != null && customerOffer < ctx.minPrice
        ? 'counter'
        : decision

    const safeCounter =
      (safeDecision === 'counter' || safeDecision === 'accept') && counterOffer < ctx.minPrice
        ? ctx.minPrice
        : counterOffer

    return {
      reply: typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply.trim()
        : (customerOffer != null
            ? ruleBasedDecision(customerOffer, ctx).reply
            : buildOpeningMessage(ctx)),
      decision: safeDecision as NegotiationResult['decision'],
      counterOffer: safeCounter,
      tactic: typeof parsed.tactic === 'string' ? parsed.tactic : 'conversational',
      sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
      metadata: { model: 'gpt-4o-mini', raw: parsed },
    }
  } catch (err: any) {
    console.error('[BARGAIN_AI_ERROR]', err?.message ?? err)
    return customerOffer != null
      ? ruleBasedDecision(customerOffer, ctx)
      : { reply: buildOpeningMessage(ctx), decision: 'chat', counterOffer: ctx.minPrice, tactic: 'conversational', sentiment: 'neutral' }
  }
}
