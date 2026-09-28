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
// Pacing bottoms out at `quotedFloor`, not `minPrice`. At full progress a raw
// curve would return the merchant's exact minimum, and the caller would then
// quote it to the customer — turning an internal threshold into a disclosed
// price. The true floor is reachable only by a customer making their own offer.
export function graduatedCounter(ctx: NegotiationContext): number {
  const { originalPrice, minPrice, attemptsUsed, maxAttempts } = ctx
  const progress = maxAttempts > 0 ? Math.min(1, Math.max(0, attemptsUsed / maxAttempts)) : 1
  const priceRange = originalPrice - minPrice
  const counter = originalPrice - priceRange * progress
  return Math.round(Math.max(quotedFloor(ctx), counter) * 100) / 100
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

// ── Safe final-quote floor (the merchant's true minimum is never spoken) ──
// A quoted "final" price sits 1% ABOVE the internal accept threshold, so a
// customer can always reach it by haggling but the hidden floor itself is never
// named, printed, or implied. minPrice stays the internal accept rule — a
// shopper's OWN offer at/above the floor is still honoured — while the bot never
// volunteers floor-level money. Shared with the server path so the storefront
// widget and the client-side demo can never disagree on this number.
export function quotedFloor(ctx: Pick<NegotiationContext, 'minPrice' | 'originalPrice'>): number {
  const cushion = Math.max(1, Math.round(ctx.minPrice * 0.01 * 100) / 100)
  return Math.min(ctx.originalPrice, Math.round((ctx.minPrice + cushion) * 100) / 100)
}

// ── Rule-based decision (no AI) ──
// This runs precisely when the AI tier is down, so it is what a shopper sees
// during an outage. It must therefore be persona-true and floor-safe: it quotes
// `quotedFloor` and never describes any price as the lowest/final limit.
//
// `counterFor` lets the server inject its goal/strategy-aware counter while the
// client-side demo uses the pure pacing curve — same copy, same secrecy, one
// implementation.
export function ruleBasedDecision(
  offer: number,
  ctx: NegotiationContext,
  counterFor: (ctx: NegotiationContext) => number = graduatedCounter,
): NegotiationResult {
  const boundedOffer = Math.max(0, Math.min(offer, ctx.originalPrice))
  const { minPrice, originalPrice, attemptsUsed, maxAttempts, persona } = ctx
  const attemptsLeft = maxAttempts - attemptsUsed
  const currencySymbol = ctx.currencySymbol

  if (boundedOffer >= minPrice) {
    const accept: Record<Persona, string> = {
      strict_negotiator: `Agreed at ${currencySymbol}${boundedOffer.toFixed(2)}. Confirm the acceptance and your discount code will be generated.`,
      playful_friend: `DEAL! 🎉 ${currencySymbol}${boundedOffer.toFixed(2)} — you absolute legend! Hit Accept and the magic code is yours.`,
      friendly_shopkeeper: `It's a deal, friend! 🎉 ${currencySymbol}${boundedOffer.toFixed(2)} works for me. Accept it and I'll sort your code right away.`,
    }
    return {
      reply: accept[persona] ?? accept.friendly_shopkeeper,
      decision: 'accept',
      counterOffer: boundedOffer,
      tactic: 'accept_at_floor',
      sentiment: 'happy',
    }
  }

  // No counter may sit at or below the safe quote: the hidden minimum is an
  // internal accept threshold, never a price we volunteer.
  const counter = Math.min(originalPrice, Math.max(quotedFloor(ctx), counterFor(ctx)))

  if (boundedOffer < minPrice * 0.3) {
    const lowball: Record<Persona, string> = {
      strict_negotiator: `${currencySymbol}${boundedOffer.toFixed(2)} is not feasible. My position: ${currencySymbol}${counter.toFixed(2)}. Confirm within this session if that works.`,
      playful_friend: `WOW. ${currencySymbol}${boundedOffer.toFixed(2)}?! Nice try 😄 Come back to earth with me — ${currencySymbol}${counter.toFixed(2)}. Now we're talking?`,
      friendly_shopkeeper: `Oh friend, I wish I could do ${currencySymbol}${boundedOffer.toFixed(2)}! 😄 Realistically I can offer ${currencySymbol}${counter.toFixed(2)} as a fair starting point. Does that work better?`,
    }
    return {
      reply: lowball[persona] ?? lowball.friendly_shopkeeper,
      decision: 'counter',
      counterOffer: counter,
      tactic: 'graduated_open',
      sentiment: 'playful',
    }
  }

  if (attemptsLeft > 1) {
    const meet: Record<Persona, string> = {
      strict_negotiator: `I appreciate the offer, however ${currencySymbol}${boundedOffer.toFixed(2)} is below my position. Given the quality, I can offer ${currencySymbol}${counter.toFixed(2)}. Your call.`,
      playful_friend: `Mmm, ${currencySymbol}${boundedOffer.toFixed(2)}? You'll have to do better than that 😏 I'll meet you at ${currencySymbol}${counter.toFixed(2)} — and that's me being generous!`,
      friendly_shopkeeper: `Hmm, ${currencySymbol}${boundedOffer.toFixed(2)} is a little low for me. Let's meet in the middle — how about ${currencySymbol}${counter.toFixed(2)}? I think that's fair for the quality.`,
    }
    return {
      reply: meet[persona] ?? meet.friendly_shopkeeper,
      decision: 'counter',
      counterOffer: counter,
      tactic: 'meet_partway',
      sentiment: 'conciliatory',
    }
  }

  const quote = quotedFloor(ctx)
  const final: Record<Persona, string> = {
    strict_negotiator: `This is my final position: ${currencySymbol}${quote.toFixed(2)}. I've justified it clearly. The decision is yours.`,
    playful_friend: `OKAY OKAY, you win! 🙃 FINAL final offer: ${currencySymbol}${quote.toFixed(2)}. If my boss asks, this never happened. Deal?`,
    friendly_shopkeeper: `Friend, I've stretched as far as I can. My final offer: ${currencySymbol}${quote.toFixed(2)}. I really hope you'll take it — let's make this work!`,
  }
  return {
    reply: final[persona] ?? final.friendly_shopkeeper,
    decision: 'counter',
    counterOffer: quote,
    tactic: 'final_offer',
    sentiment: 'final',
  }
}

// ── Walkout retention offer (no AI) ──
// Floor-safe for the same reason as `ruleBasedDecision`: never below
// `quotedFloor`, so a retention price can never be mistaken for the minimum.
export function retentionOffer(ctx: NegotiationContext, lastCounter: number | null): NegotiationResult {
  const { minPrice, originalPrice, currencySymbol, persona } = ctx
  const last = lastCounter ?? originalPrice
  const step = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1)
  const price = Math.max(quotedFloor(ctx), Math.round((last - step) * 100) / 100)
  const fmt = (n: number) => n.toFixed(2)

  let reply: string
  if (persona === 'strict_negotiator') {
    reply = `One moment. For this order I can stretch to ${currencySymbol}${fmt(price)}. Your call.`
  } else if (persona === 'playful_friend') {
    reply = `WAIT WAIT WAIT! Okay, you drive a hard bargain! For you, today — ${currencySymbol}${fmt(price)}. Deal?`
  } else {
    reply = `Wait, friend — before you go! For you, I can do ${currencySymbol}${fmt(price)} today. Please stay — I really want this to work for you.`
  }

  return { reply, decision: 'counter', counterOffer: price, tactic: 'walkout_retention', sentiment: 'urgent' }
}
