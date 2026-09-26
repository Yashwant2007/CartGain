// Pure, dependency-free bargain negotiation logic.
// Safe to import from client components (no Prisma, no OpenAI).
// Re-exported by services/bargain.ts for server-side use.

export type Persona = 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'

export const SUPPORTED_LANGUAGES = ['auto', 'en', 'hinglish', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'] as const
export type BargainLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// ── AI Salesperson: dynamic strategy ─────────────────────────────────────────
// Strategy is chosen by the deterministic pacing layer (src/lib/bargain/goals.ts)
// and only ever nudges behaviour WITHIN the merchant's absolute floor. The
// floor itself is non-negotiable and enforced by the backend, never here.
export type BargainStrategy = 'CONSERVATIVE' | 'NORMAL' | 'AGGRESSIVE' | 'CLOSING'
export type GoalMode = 'ahead' | 'on_track' | 'behind' | 'idle'

export interface NegotiationGoalContext {
  strategy: BargainStrategy
  mode: GoalMode
  goalType: 'orders' | 'revenue'
  closesAt?: string // ISO instant the real goal window closes (truthful urgency)
  campaignName?: string
  campaignMessage?: string
}

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
  goal?: NegotiationGoalContext
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

// ── Strategy-aware counter ──
// Shifts a base counter within [minPrice, originalPrice] according to the
// deterministically-chosen strategy. CONSERVATIVE keeps the price higher
// (protect margin when the daily goal is ahead); AGGRESSIVE/CLOSING push lower
// (close more deals when behind near the window end). The strategy NEVER moves a
// counter below the absolute merchant floor.
export function strategyAdjustedCounter(
  ctx: NegotiationContext,
  strategy: BargainStrategy,
  base?: number,
): number {
  const { originalPrice, minPrice } = ctx
  const range = originalPrice - minPrice
  const start = base ?? graduatedCounter(ctx)
  if (range <= 0) return minPrice

  let adjusted = start
  switch (strategy) {
    case 'CONSERVATIVE':
      adjusted = start + range * 0.25
      break
    case 'AGGRESSIVE':
      adjusted = start - range * 0.12
      break
    case 'CLOSING':
      adjusted = start - range * 0.3
      break
    case 'NORMAL':
      break
  }

  return Math.round(Math.min(originalPrice, Math.max(minPrice, adjusted)) * 100) / 100
}

// ── Deterministic final safety validator ──
// The last line of defence shared by every path that turns a suggested price
// into an offer: clamp to [minPrice, originalPrice] and round to 2dp. Strategy
// or AI may suggest anything; this decides what is actually offered.
export function clampOfferToSafety(opts: {
  originalPrice: number
  minPrice: number
  suggested: number
}): number {
  const { originalPrice, minPrice, suggested } = opts
  if (!Number.isFinite(suggested) || suggested < 0) return minPrice
  const rounded = Math.round(suggested * 100) / 100
  return Math.min(originalPrice, Math.max(minPrice, rounded))
}

// ── Bulk-volume floor factor (deeper per-unit floor for larger orders) ──
export function bulkFloorFactor(quantity: number): number {
  if (quantity >= 20) return 0.85
  if (quantity >= 10) return 0.90
  if (quantity >= 5) return 0.95
  return 1.0
}

// ── Default opening message (persona-aware, language-aware) ──
// A real shopkeeper never counts chances aloud — the attempt budget stays an
// internal mechanic. The welcome names the price and explicitly invites BOTH a
// number and product questions ("ask me anything"), so the bot reads as an
// interactive salesperson, not a fixed script.
export function buildOpeningMessage(ctx: NegotiationContext): string {
  const { originalPrice, currencySymbol, productTitle, customerContext, language } = ctx
  const item = productTitle ? `this ${productTitle}` : 'this'
  const warmup = customerContext ? ' Welcome back! 🙌' : ''
  const price = `${currencySymbol}${originalPrice.toFixed(2)}`

  if (language === 'hinglish') {
    const opening: Record<Persona, string> = {
      playful_friend: `Arré arre! 👋 Aap ${productTitle ?? 'yeh item'} dekh rahe ho? Kamaal hai! Listed hai ${price} — par yeh to bas shuruwat hai 😏 Bolo, aapka best rate kya hai — ya kuch poochhna ho toh poochh lo!${warmup}`,
      strict_negotiator: `${productTitle ?? 'Is item'} mein interest ke liye dhanyavaad.${warmup} Current price hai ${price}. Reasonable offer sunne ke liye taiyar hoon. Aapke mann mein kitna price hai?`,
      friendly_shopkeeper: `Arré welcome! 👋${warmup} Main dekha ${productTitle ?? 'yeh item'} aapko pasand aaya. Iska price ${price} hai — par hum achha deal kar sakte hain. Aap apna rate batao, ya iske baare mein kuch bhi poochh lo!`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (language === 'hi') {
    const opening: Record<Persona, string> = {
      playful_friend: `अरे अरे! 👋 आप ${productTitle ?? 'ये आइटम'} देख रहे हैं — शानदार चुनाव! लिस्टेड कीमत है ${price}। पर ये तो बस शुरुआत है 😏 बताइए, आप कितनी कीमत सोच रहे हैं? या कुछ पूछना हो तो पूछिए!${warmup}`,
      strict_negotiator: `${productTitle ?? 'इस आइटम'} में रुचि दिखाने के लिए धन्यवाद${warmup}। वर्तमान कीमत ${price} है। आपका प्रस्ताव क्या है?`,
      friendly_shopkeeper: `नमस्ते! 👋${warmup} आपको ${productTitle ?? 'ये आइटम'} पसंद आया, ये बहुत अच्छा है। कीमत है ${price}। आप क्या कीमत सोच रहे हैं? या इसके बारे में कुछ पूछना हो तो पूछिए!`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (ctx.persona === 'playful_friend') {
    return `${warmup} Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ${price}, and it's yours for the right price 😏 What's your move — name a number, or ask me anything about it?`
  }
  if (ctx.persona === 'strict_negotiator') {
    return `Thank you for your interest in ${item}.${warmup} The current price is ${price}. I'm open to a reasonable offer — what price did you have in mind?`
  }
  return `Hey! Welcome 👋${warmup} I see you're interested in ${item}. It's listed at ${price}. I'd love to help you get a good deal — what price were you thinking? And if you have any questions about it, just ask!`
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
