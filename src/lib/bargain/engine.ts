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
  // ── Customer-visible progress for the widget's "Today's goal" strip ──
  // Populated only while the goal window is active. These are the REAL target
  // and the REAL ledger totals — never derived from (and never revealing) the
  // floor, margin, attempt budget or the internal pacing strategy.
  targetValue?: number
  achievedValue?: number
  orderCount?: number
  progressPercent?: number // 0–100
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
  /** Deterministic read of the customer's offer direction across the session
   *  (mirrors services/bargain). Drives the tactical pacing nudge. */
  customerOfferTrend?: 'new' | 'rising' | 'flat' | 'falling'
  /** Deterministic buyer-seriousness read (mirrors services/bargain). A genuine
   *  buyer earns a little more movement; a time-waster is held firmer. */
  seriousness?: 'serious' | 'casual' | 'time_waster'
  /** The AI's most recent standing counter in this session. Lets the reciprocal
   *  pacing be monotonic (a real shopkeeper does not RAISE a price mid-haggle)
   *  without ever needing the hidden floor. */
  lastCounter?: number | null
  /** How many absurd lowballs in a row the shopper has now thrown (including the
   *  current one). Lets the persona reply ESCALATE and stop repeating itself,
   *  instead of parroting the same joke line every turn. Callers with history
   *  set it; engines without it fall back to offer-based variation. */
  absurdStreak?: number
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

// ── Tactical pacing: concede slowly, reward real interest ──
// The graduated curve above moves linearly, so the very first counter can already
// sit well below the listed price — it reads as a panic discount and gives away
// margin before the shopper has shown any real interest. `tacticalCounter` is
// deliberately CONVEX: early counters stay near the listed price and only bend
// toward the safe quote as rounds are actually spent, so the discount has to be
// earned. A deterministic interest read then nudges the number — a serious buyer
// gets a touch more movement, a time-waster is held firmer — and real upward
// movement in the shopper's own offers is rewarded. The result is always clamped
// to [quotedFloor, originalPrice]: pacing shapes the offer, it never breaches the
// floor-secrecy rule (the merchant's true minimum is never quoted).
export function tacticalProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return Math.round(Math.pow(clamped, 1.6) * 1e6) / 1e6
}

export function tacticalCounter(ctx: NegotiationContext): number {
  const { originalPrice, attemptsUsed, maxAttempts } = ctx
  const floor = quotedFloor(ctx)
  const range = originalPrice - floor
  if (range <= 0) return Math.round(floor * 100) / 100

  const rawProgress = maxAttempts > 0 ? attemptsUsed / maxAttempts : 1
  const progress = tacticalProgress(rawProgress)
  let counter = originalPrice - range * progress

  // Interest-aware nudge — reward engagement, hold against testing.
  if (ctx.seriousness === 'serious') counter -= range * progress * 0.08
  else if (ctx.seriousness === 'time_waster') counter += range * (1 - progress) * 0.12
  if (ctx.customerOfferTrend === 'rising') counter -= range * progress * 0.05

  return Math.round(Math.min(originalPrice, Math.max(floor, counter)) * 100) / 100
}

// ── Absurd offers get a PERSONA REPLY, never a counter ──
// An offer so far below the merchant's floor that treating it as a genuine bid
// would be theatre. The old engine "countered" these on the schedule, which did
// two bad things: (1) it rewarded a joke with a real number, and (2) it taught
// shoppers that patient lowballing walks the price down to the floor. Instead
// such a turn earns a persona-true reply with NO counter price.
//
// The reply ESCALATES across repeats so it reads like a live negotiator, not a
// looping script: the first joke gets light banter, a rising series of jokes gets
// acknowledged ("you're inching up"), and a sustained streak gets a firm,
// floor-safe ANCHOR (the quotable floor, always ABOVE the hidden minimum) so the
// shopper is handed a real number to work from instead of a dead end. The variant
// is picked deterministically from the offer value and the streak, so two
// identical requests always get identical copy (idempotent) while consecutive
// turns never repeat verbatim.
export function isAbsurdOffer(
  offer: number | null | undefined,
  ctx: Pick<NegotiationContext, 'minPrice' | 'originalPrice'>,
): boolean {
  if (offer == null || !Number.isFinite(offer) || offer <= 0) return true
  const floor = ctx.minPrice > 0 ? ctx.minPrice : ctx.originalPrice
  return offer <= floor * 0.5 || offer <= ctx.originalPrice * 0.1
}

function stableHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function absurdOfferReply(offer: number, ctx: NegotiationContext): string {
  const cur = ctx.currencySymbol
  const item = ctx.productTitle ? `this ${ctx.productTitle}` : 'this'
  const shown = Number.isFinite(offer) && offer > 0 ? offer.toFixed(2) : '0'
  const price = `${cur}${shown}`
  const anchor = `${cur}${quotedFloor(ctx).toFixed(2)}`

  // How many absurd jabs in a row — callers with history pass the true streak;
  // otherwise fall back to the (non-burning) attempt counter.
  const streak = Math.max(1, Math.floor(ctx.absurdStreak ?? ctx.attemptsUsed ?? 0) || 1)
  const stage = streak <= 1 ? 1 : streak === 2 ? 2 : 3

  const banks: Record<Persona, { s1: string[]; s2: string[]; s3: string[] }> = {
    strict_negotiator: {
      s1: [
        `${price} is not a serious offer for ${item}. I don't negotiate on jokes — give me a realistic number.`,
        `That's not a serious offer. ${price} won't get you ${item} — name a realistic number.`,
        `I'll be blunt: ${price} is not a serious offer. Come back with a realistic number and I'll work with you.`,
      ],
      s2: [
        `You're edging up, but ${price} is still not in the conversation for ${item}. Stop testing me and give me a realistic number.`,
        `${price} is still far off. I hear the bump — it's just not enough. Name a realistic number.`,
      ],
      s3: [
        `We're going in circles. ${price} isn't happening. My realistic starting point is ${anchor} — meet me near that and we have a deal.`,
        `Enough of this. ${price} won't work for ${item}. I can start around ${anchor}; if that's workable, the deal is yours.`,
        `Straight talk: ${price} is off the table. My position starts at ${anchor}. Bring a serious offer and we'll close.`,
      ],
    },
    playful_friend: {
      s1: [
        `Ha! ${price}? For that I'll throw in the box it came in. Come on — play ball with a real number!`,
        `${price}?! You're joking — for that I'll throw in the box it came in! Give me a real number and let's play ball.`,
        `Nice try! ${price} won't do it — but I like the hustle. Throw a real number at me and we'll play ball.`,
      ],
      s2: [
        `You keep nudging it up — I see the game! But ${price} is still a no. Play ball with a real number.`,
        `Ooh, inching up! ${price} still won't fly, though. Throw me a number I can actually play ball with.`,
      ],
      s3: [
        `Okay, enough games — you're clearly testing me! ${price} won't fly, but let's get real: my ballpark starts around ${anchor}. Play in that range!`,
        `You're persistent, I'll give you that! ${price} is still a joke — real talk, I start around ${anchor}. Meet me there?`,
        `Cards on the table: ${price} is a no. My ballpark opens near ${anchor}. Get in the game and we'll talk!`,
      ],
    },
    friendly_shopkeeper: {
      s1: [
        `Oh friend, ${price} wouldn't even cover the packaging! What's a fair number you'd genuinely pay?`,
        `Ha, ${price}? Friend, that's a warm-up, not an offer. What are you really thinking?`,
        `I love the enthusiasm, friend — but ${price} won't work. What number feels fair to you?`,
      ],
      s2: [
        `I can tell you're inching up, friend, and I appreciate it — but ${price} is still too far off for ${item}. What feels fair?`,
        `You're getting warmer, friend, but ${price} is still not workable. Give me a realistic number and I'll do my best.`,
      ],
      s3: [
        `Friend, ${price} genuinely won't work, and I don't want to waste your time. A real starting point for ${item} is around ${anchor} — if that's workable, we'll make it happen.`,
        `I want to be straight with you: ${price} is out of reach for ${item}. We can start around ${anchor}. Shall we try that?`,
        `Honestly, ${price} isn't doable for ${item} — but I don't want you to walk away. Around ${anchor} I can make something work.`,
      ],
    },
  }

  const bank = banks[ctx.persona] ?? banks.friendly_shopkeeper
  const pool = stage === 1 ? bank.s1 : stage === 2 ? bank.s2 : bank.s3
  const idx = (stableHash(shown) + streak) % pool.length
  return pool[idx]
}

// ── Reciprocal counter: bargain like a person, not a schedule ──
// The old model conceded on a fixed curve keyed only to the turn number, so the
// same numbers appeared every session (₹964.25, then ₹950, …) and any shopper
// who simply waited always saw the price march down to the floor. This model
// instead RESPONDS to what the customer actually does:
//   • it holds at this round's EARNED price — a convex, interest-aware position
//     that concedes slowly at first and never sinks to the hidden floor for an
//     ordinary buyer (only a genuinely serious buyer earns the bottom),
//   • it MEETS a customer who moves up to or beyond that price (they named a
//     number we can live with — we take it, never ask for more),
//   • it HOLDS when the shopper is unserious, repeats a lowball, or goes
//     backwards (no reward for testing), and
//   • it is MONOTONIC — the standing price never rises mid-negotiation.
// Because the customer's own offer, the trend, the seriousness and the AI's last
// standing price all move the number, two sessions with different behaviour
// produce different prices: genuine haggling, not a fixed rate of steps.
export function reciprocalCounter(
  ctx: NegotiationContext,
  offer?: number | null,
  lastCounter?: number | null,
): number {
  const list = ctx.originalPrice
  const quoted = quotedFloor(ctx)
  if (list <= quoted) return Math.round(quoted * 100) / 100

  const range = list - quoted
  const rawProgress = ctx.maxAttempts > 0 ? ctx.attemptsUsed / ctx.maxAttempts : 1
  const progress = tacticalProgress(rawProgress)

  // How far the AI is WILLING to move this turn. Interest-aware: a serious buyer
  // earns more movement, a time-waster is held firm, and the shopper's own offer
  // direction matters most (rising rewards, flat/falling holds).
  let engagement = 0.75
  if (ctx.seriousness === 'serious') engagement = 1
  else if (ctx.seriousness === 'casual') engagement = 0.55
  else if (ctx.seriousness === 'time_waster') engagement = 0.1
  if (ctx.customerOfferTrend === 'rising') engagement = Math.min(1, engagement + 0.2)
  else if (ctx.customerOfferTrend === 'flat') engagement = Math.max(0.05, engagement - 0.3)
  else if (ctx.customerOfferTrend === 'falling') engagement = Math.max(0.05, engagement - 0.45)

  // This round's earned price. Note engagement < 1 stops an ordinary buyer ABOVE
  // the hidden floor — the AI does not always reach it, so holding out is not
  // automatically rewarded.
  const earnedFloor = list - range * progress * engagement

  // The AI's standing price: its last counter if there was one, else the list.
  const base =
    lastCounter != null && Number.isFinite(lastCounter) && lastCounter >= quoted && lastCounter <= list
      ? lastCounter
      : list

  // The hold price for this turn — never above the standing price (monotonic),
  // never below the safe floor.
  const low = Math.min(base, Math.max(earnedFloor, quoted))

  // If the customer has moved to or above the price we're willing to hold, meet
  // them at their own number (we never ask for more than they offered). Otherwise
  // hold firm — a low or repeated offer is not rewarded.
  const meet = offer != null && Number.isFinite(offer) && offer > low ? Math.min(base, offer) : low

  return Math.round(Math.min(list, Math.max(quoted, meet)) * 100) / 100
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
  const warmup = customerContext ? ' Welcome back!' : ''
  const price = `${currencySymbol}${originalPrice.toFixed(2)}`

  if (language === 'hinglish') {
    const opening: Record<Persona, string> = {
      playful_friend: `Arré arre! Aap ${productTitle ?? 'yeh item'} dekh rahe ho? Kamaal hai! Listed hai ${price} — par yeh to bas shuruwat hai. Bolo, aapka best rate kya hai — ya kuch poochhna ho toh poochh lo!${warmup}`,
      strict_negotiator: `${productTitle ?? 'Is item'} mein interest ke liye dhanyavaad.${warmup} Current price hai ${price}. Reasonable offer sunne ke liye taiyar hoon. Aapke mann mein kitna price hai?`,
      friendly_shopkeeper: `Arré welcome!${warmup} Main dekha ${productTitle ?? 'yeh item'} aapko pasand aaya. Iska price ${price} hai — par hum achha deal kar sakte hain. Aap apna rate batao, ya iske baare mein kuch bhi poochh lo!`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (language === 'hi') {
    const opening: Record<Persona, string> = {
      playful_friend: `अरे अरे! आप ${productTitle ?? 'ये आइटम'} देख रहे हैं — शानदार चुनाव! लिस्टेड कीमत है ${price}। पर ये तो बस शुरुआत है। बताइए, आप कितनी कीमत सोच रहे हैं? या कुछ पूछना हो तो पूछिए!${warmup}`,
      strict_negotiator: `${productTitle ?? 'इस आइटम'} में रुचि दिखाने के लिए धन्यवाद${warmup}। वर्तमान कीमत ${price} है। आपका प्रस्ताव क्या है?`,
      friendly_shopkeeper: `नमस्ते!${warmup} आपको ${productTitle ?? 'ये आइटम'} पसंद आया, ये बहुत अच्छा है। कीमत है ${price}। आप क्या कीमत सोच रहे हैं? या इसके बारे में कुछ पूछना हो तो पूछिए!`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (ctx.persona === 'playful_friend') {
    return `${warmup} Hey hey! I see you're checking out ${item} — nice choice! Listed at ${price}, and it's yours for the right price. What's your move — name a number, or ask me anything about it?`
  }
  if (ctx.persona === 'strict_negotiator') {
    return `Thank you for your interest in ${item}.${warmup} The current price is ${price}. I'm open to a reasonable offer — what price did you have in mind?`
  }
  return `Hey! Welcome!${warmup} I see you're interested in ${item}. It's listed at ${price}. I'd love to help you get a good deal — what price were you thinking? And if you have any questions about it, just ask!`
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
  counterFor: (ctx: NegotiationContext, offer: number, last: number | null) => number = reciprocalCounter,
): NegotiationResult {
  const boundedOffer = Math.max(0, Math.min(offer, ctx.originalPrice))
  const { minPrice, originalPrice, attemptsUsed, maxAttempts, persona } = ctx
  const attemptsLeft = maxAttempts - attemptsUsed
  const currencySymbol = ctx.currencySymbol

  if (boundedOffer >= minPrice) {
    const accept: Record<Persona, string> = {
      strict_negotiator: `Agreed at ${currencySymbol}${boundedOffer.toFixed(2)}. Confirm the acceptance and your discount code will be generated.`,
      playful_friend: `DEAL! ${currencySymbol}${boundedOffer.toFixed(2)} — you absolute legend! Hit Accept and the magic code is yours.`,
      friendly_shopkeeper: `It's a deal, friend! ${currencySymbol}${boundedOffer.toFixed(2)} works for me. Accept it and I'll sort your code right away.`,
    }
    return {
      reply: accept[persona] ?? accept.friendly_shopkeeper,
      decision: 'accept',
      counterOffer: boundedOffer,
      tactic: 'accept_at_floor',
      sentiment: 'happy',
    }
  }

  // An absurd offer is NOT a bid to be answered with a price. Reply in persona
  // (strict handles it strictly, playful jokes, friendly stays warm) and invite a
  // real number — never reward a joke with a number, and never burn a scheduled
  // step on it.
  if (isAbsurdOffer(boundedOffer, ctx)) {
    return {
      reply: absurdOfferReply(boundedOffer, ctx),
      decision: 'chat',
      tactic: 'absurd_offer',
      sentiment: persona === 'playful_friend' ? 'playful' : persona === 'strict_negotiator' ? 'firm' : 'warm',
    }
  }

  // A genuine below-floor offer: respond with the reciprocal counter (never below
  // the round's earned, floor-safe standing price).
  let counter = counterFor(ctx, boundedOffer, ctx.lastCounter ?? null)
  counter = Math.min(originalPrice, Math.max(quotedFloor(ctx), counter))
  // A counter must always be a REAL drop below the listed price.
  if (counter >= originalPrice) {
    counter = Math.max(quotedFloor(ctx), originalPrice - Math.max(1, originalPrice * 0.01))
  }

  if (attemptsLeft > 1) {
    const meet: Record<Persona, string> = {
      strict_negotiator: `I appreciate the offer, however ${currencySymbol}${boundedOffer.toFixed(2)} is below my position. Given the quality, I can offer ${currencySymbol}${counter.toFixed(2)}. Your call.`,
      playful_friend: `Mmm, ${currencySymbol}${boundedOffer.toFixed(2)}? You'll have to do better than that. I'll meet you at ${currencySymbol}${counter.toFixed(2)} — and that's me being generous!`,
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

  const final: Record<Persona, string> = {
    strict_negotiator: `This is my position: ${currencySymbol}${counter.toFixed(2)}. I've justified it clearly. The decision is yours.`,
    playful_friend: `Okay, here's where I can land — ${currencySymbol}${counter.toFixed(2)}. If my boss asks, this never happened. Deal?`,
    friendly_shopkeeper: `Friend, I've stretched as far as I can for now. My best is ${currencySymbol}${counter.toFixed(2)}. I really hope you'll take it — let's make this work!`,
  }
  return {
    reply: final[persona] ?? final.friendly_shopkeeper,
    decision: 'counter',
    counterOffer: counter,
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
