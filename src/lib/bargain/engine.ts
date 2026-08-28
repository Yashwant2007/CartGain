// Pure, dependency-free bargain negotiation logic.
// Safe to import from client components (no Prisma, no OpenAI).
// Re-exported by services/bargain.ts for server-side use.

export type Persona = 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'

export const SUPPORTED_LANGUAGES = ['auto', 'en', 'hinglish', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'] as const
export type BargainLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export interface NegotiationContext {
  storeName: string
  currencySymbol: string
  originalPrice: number
  minPrice: number
  attemptsUsed: number
  maxAttempts: number
  persona: Persona
  productTitle?: string
  customerContext?: string
  bulkQuantity?: number
  walkoutTriggered?: boolean
  language?: string
}

export interface NegotiationResult {
  reply: string
  decision: 'accept' | 'counter' | 'reject' | 'welcome' | 'chat'
  counterOffer?: number
  tactic?: string
  sentiment?: string
  metadata?: Record<string, unknown>
}

// ── Graduated counter: near original early, near floor late ──
export function graduatedCounter(ctx: NegotiationContext): number {
  const { originalPrice, minPrice, attemptsUsed, maxAttempts } = ctx
  const progress = attemptsUsed / maxAttempts
  const priceRange = originalPrice - minPrice
  const counter = originalPrice - priceRange * progress
  return Math.round(counter * 100) / 100
}

// ── Bulk-volume floor factor (deeper per-unit floor for larger orders) ──
export function bulkFloorFactor(quantity: number): number {
  if (quantity >= 20) return 0.85
  if (quantity >= 10) return 0.90
  if (quantity >= 5) return 0.95
  return 1.0
}

// ── Default opening message (persona-aware, language-aware) ──
export function buildOpeningMessage(ctx: NegotiationContext): string {
  const { originalPrice, currencySymbol, maxAttempts, productTitle, customerContext, language } = ctx
  const item = productTitle ? `this ${productTitle}` : 'this'
  const warmup = customerContext ? ' Welcome back! 🙌' : ''
  const price = `${currencySymbol}${originalPrice.toFixed(2)}`

  if (language === 'hinglish') {
    const opening: Record<Persona, string> = {
      playful_friend: `Arré arre! 👋 Aap ${productTitle ?? 'yeh item'} dekh rahe ho? Kamaal hai! Listed hai ${price} — par yeh to bas shuruwat hai 😏 ${maxAttempts} mauke hain mujhe patane ke. Bolo, aapka best rate kya hai?${warmup}`,
      strict_negotiator: `${productTitle ?? 'Is item'} mein interest ke liye dhanyavaad.${warmup} Current price hai ${price}. ${maxAttempts} baat-cheet ke andar reasonable offer sunne ke liye taiyar hoon. Aapke mann mein kitna price hai?`,
      friendly_shopkeeper: `Arré welcome! 👋${warmup} Main dekha ${productTitle ?? 'yeh item'} aapko pasand aaya. Thik hai, iska price ${price} hai — par hum bina jhagda ke achha deal kar sakte hain. ${maxAttempts} mauke milenge. Aap apna rate batao?`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (language === 'hi') {
    const opening: Record<Persona, string> = {
      playful_friend: `अरे अरे! 👋 आप ${productTitle ?? 'ये आइटम'} देख रहे हैं — शानदार चुनाव! लिस्टेड कीमत है ${price}। पर ये तो बस शुरुआत है 😏 आपके पास ${maxAttempts} मौके हैं। चलिए, देखते हैं आप कितना अच्छा सौदा कर पाते हैं!`,
      strict_negotiator: `${productTitle ?? 'इस आइटम'} में रुचि दिखाने के लिए धन्यवाद${warmup}। वर्तमान कीमत ${price} है। ${maxAttempts} आदान-प्रदान के भीतर मैं उचित प्रस्ताव स्वीकार कर सकता हूँ। आपका प्रस्ताव क्या है?`,
      friendly_shopkeeper: `नमस्ते! 👋${warmup} आपको ${productTitle ?? 'ये आइटम'} पसंद आया, ये बहुत अच्छा है। कीमत है ${price}। मैं आपकी मदद करना चाहता हूँ — आप क्या कीमत सोच रहे हैं? बातचीत के लिए आपके पास ${maxAttempts} मौके हैं।`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (ctx.persona === 'playful_friend') {
    return `${warmup} Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ${price}, but hey, that's just the starting point 😏 You've got ${maxAttempts} chances to charm me into a better deal. What's your move?`
  }
  if (ctx.persona === 'strict_negotiator') {
    return `Thank you for your interest in ${item}.${warmup} The current price is ${price}. I'm open to reasonable offers within ${maxAttempts} exchanges. What price were you considering?`
  }
  return `Hey! Welcome 👋${customerContext ? ' So good to see you again!' : ''} I see you're interested in ${item}. It's listed at ${price}. I'd love to help you get a good deal — what price were you thinking? You've got ${maxAttempts} attempts to bargain with me.`
}

// ── Rule-based decision (no AI) ──
export function ruleBasedDecision(offer: number, ctx: NegotiationContext): NegotiationResult {
  const { minPrice, originalPrice, attemptsUsed, maxAttempts } = ctx
  const attemptsLeft = maxAttempts - attemptsUsed
  const currencySymbol = ctx.currencySymbol

  if (offer >= minPrice) {
    return {
      reply: `Done! ${currencySymbol}${offer.toFixed(2)} works for me 🎉 Shall we lock it in? Click "Accept" and I'll generate your discount code.`,
      decision: 'accept',
      counterOffer: offer,
      tactic: 'accept_at_floor',
      sentiment: 'happy',
    }
  }

  if (offer < minPrice * 0.3) {
    const counter = graduatedCounter(ctx)
    return {
      reply: `I appreciate the creativity 😄 but I can't do ${currencySymbol}${offer.toFixed(2)}. Let me offer ${currencySymbol}${counter.toFixed(2)} — a fair starting point. What do you think?`,
      decision: 'counter',
      counterOffer: counter,
      tactic: 'graduated_open',
      sentiment: 'playful',
    }
  }

  const counter = graduatedCounter(ctx)
  if (attemptsLeft > 1) {
    return {
      reply: `Hmm, ${currencySymbol}${offer.toFixed(2)} is a bit low for me. Let me meet you partway — how about ${currencySymbol}${counter.toFixed(2)}? I think that's fair given the quality.`,
      decision: 'counter',
      counterOffer: counter,
      tactic: 'meet_partway',
      sentiment: 'conciliatory',
    }
  }

  return {
    reply: `Alright, I've done my best 🙂 This is my final offer: ${currencySymbol}${minPrice.toFixed(2)}. It's the lowest I can go. Take it or leave it — but I really hope you take it!`,
    decision: 'counter',
    counterOffer: minPrice,
    tactic: 'final_offer',
    sentiment: 'final',
  }
}

// ── Walkout retention offer (no AI) ──
export function retentionOffer(ctx: NegotiationContext, lastCounter: number | null): NegotiationResult {
  const { minPrice, originalPrice, currencySymbol, persona } = ctx
  const last = lastCounter ?? originalPrice
  const step = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1)
  const price = Math.max(minPrice, Math.round((last - step) * 100) / 100)
  const fmt = (n: number) => n.toFixed(2)

  let reply: string
  if (persona === 'strict_negotiator') {
    reply = `One moment. Given the circumstances, I am prepared to make a one-time adjustment to ${currencySymbol}${fmt(price)}. Beyond that, my offer stands. Your decision.`
  } else if (persona === 'playful_friend') {
    reply = `WAIT WAIT WAIT! 😅 Okay, you drive a hard bargain. FINAL final offer: ${currencySymbol}${fmt(price)}. I'm risking my job for this 🙃 Deal?`
  } else {
    reply = `Wait, friend — before you go! For you, I can do ${currencySymbol}${fmt(price)}. That's me stretching every rupee. Please stay — I really want this to work for you.`
  }

  return { reply, decision: 'counter', counterOffer: price, tactic: 'walkout_retention', sentiment: 'urgent' }
}
