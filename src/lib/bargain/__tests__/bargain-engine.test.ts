import {
  ruleBasedDecision,
  retentionOffer,
  bulkFloorFactor,
  buildOpeningMessage,
  type NegotiationContext,
} from '../../services/bargain'
import { tacticalCounter, tacticalProgress, quotedFloor, isAbsurdOffer, reciprocalCounter } from '../engine'

const baseCtx = (over: Partial<NegotiationContext> = {}): NegotiationContext => ({
  storeName: 'Test Store',
  currencySymbol: '₹',
  originalPrice: 1000,
  minPrice: 800,
  attemptsUsed: 0,
  maxAttempts: 3,
  persona: 'friendly_shopkeeper',
  ...over,
})

// ── ruleBasedDecision ──

describe('ruleBasedDecision', () => {
  it('accepts when offer >= floor price', () => {
    const r = ruleBasedDecision(800, baseCtx())
    expect(r.decision).toBe('accept')
    expect(r.counterOffer).toBe(800)
  })

  it('accepts when offer is well above the floor', () => {
    const r = ruleBasedDecision(950, baseCtx())
    expect(r.decision).toBe('accept')
    expect(r.counterOffer).toBe(950)
  })

  it('counters when offer is below the floor but reasonable', () => {
    const r = ruleBasedDecision(700, baseCtx({ attemptsUsed: 0 }))
    expect(r.decision).toBe('counter')
    expect(r.counterOffer).toBeGreaterThan(800)
    expect(r.counterOffer).toBeLessThanOrEqual(1000)
  })

  it('never counters an absurd offer — replies in persona with no price', () => {
    const r = ruleBasedDecision(50, baseCtx({ attemptsUsed: 0 }))
    expect(r.decision).toBe('chat')
    expect(r.tactic).toBe('absurd_offer')
    expect(r.counterOffer).toBeUndefined()
  })

  it('quotes above the hidden floor on the final attempt', () => {
    const r = ruleBasedDecision(500, baseCtx({ attemptsUsed: 2, maxAttempts: 3 }))
    expect(r.decision).toBe('counter')
    expect(r.counterOffer).toBeGreaterThan(800)
    expect(r.tactic).toBe('final_offer')
  })

  it('graduates counters — later attempts yield lower counter prices', () => {
    // Chain the AI's standing price the way a real session does (the server
    // feeds back the previous counter), so the reciprocal model stays monotonic.
    const r1 = ruleBasedDecision(700, baseCtx({ attemptsUsed: 0 }))
    const r2 = ruleBasedDecision(700, baseCtx({ attemptsUsed: 1, lastCounter: r1.counterOffer ?? null }))
    const r3 = ruleBasedDecision(700, baseCtx({ attemptsUsed: 2, maxAttempts: 3, lastCounter: r2.counterOffer ?? null }))
    expect(r1.counterOffer).toBeGreaterThan(r2.counterOffer!)
    expect(r2.counterOffer).toBeGreaterThan(r3.counterOffer!)
    expect(r3.counterOffer).toBeGreaterThan(800) // quoted above the hidden floor
  })
})

// ── Absurd offers & reciprocal pacing ──

describe('isAbsurdOffer', () => {
  it('flags offers far below the floor (and hostile/non-finite values)', () => {
    const c = baseCtx() // list 1000 / floor 800
    expect(isAbsurdOffer(200, c)).toBe(true) // ≤ 50% of floor
    expect(isAbsurdOffer(400, c)).toBe(true) // exactly the boundary
    expect(isAbsurdOffer(401, c)).toBe(false)
    expect(isAbsurdOffer(0, c)).toBe(true)
    expect(isAbsurdOffer(-5, c)).toBe(true)
    expect(isAbsurdOffer(NaN, c)).toBe(true)
    expect(isAbsurdOffer(null, c)).toBe(true)
    expect(isAbsurdOffer(undefined, c)).toBe(true)
  })
})

describe('reciprocalCounter', () => {
  it('is monotonic non-increasing across a session', () => {
    const first = reciprocalCounter(baseCtx({ attemptsUsed: 1 }), 600, null)
    const second = reciprocalCounter(baseCtx({ attemptsUsed: 2 }), 600, first)
    const third = reciprocalCounter(baseCtx({ attemptsUsed: 3 }), 600, second)
    expect(first).toBeGreaterThanOrEqual(second)
    expect(second).toBeGreaterThanOrEqual(third)
  })

  it('never sinks to the hidden floor for an ordinary buyer', () => {
    const c = baseCtx({ attemptsUsed: 3, maxAttempts: 3 })
    const r = reciprocalCounter(c, 500, null)
    expect(r).toBeGreaterThan(quotedFloor(c))
    expect(r).toBeLessThanOrEqual(c.originalPrice)
  })

  it('holds firmer against an unserious buyer than a serious one', () => {
    const waster = reciprocalCounter(baseCtx({ attemptsUsed: 2, seriousness: 'time_waster' }), 600, null)
    const serious = reciprocalCounter(baseCtx({ attemptsUsed: 2, seriousness: 'serious' }), 600, null)
    expect(waster).toBeGreaterThan(serious)
  })

  it('holds on a lowball but meets a customer who moves up to our price', () => {
    const c = baseCtx({ attemptsUsed: 1 })
    const hold = reciprocalCounter(c, 500, null)
    const meet = reciprocalCounter(c, hold + 5, null)
    expect(meet).toBe(hold + 5) // we take their number, never ask for more
    expect(meet).toBeLessThanOrEqual(1000)
  })

  it('never raises the standing price mid-negotiation', () => {
    const established = 900
    const same = reciprocalCounter(baseCtx({ attemptsUsed: 2 }), 500, established)
    expect(same).toBeLessThanOrEqual(established)
  })
})

// ── retentionOffer (walkout) ──

describe('retentionOffer', () => {
  it('stays at or above the floor price', () => {
    const r = retentionOffer(baseCtx(), 950)
    expect(r.decision).toBe('counter')
    expect(r.counterOffer).toBeGreaterThanOrEqual(800)
    expect(r.tactic).toBe('walkout_retention')
  })

  it('offers a meaningful concession below the last counter', () => {
    const r = retentionOffer(baseCtx({ originalPrice: 1000, minPrice: 800 }), 950)
    expect(r.counterOffer!).toBeLessThan(950)
  })

  it('never goes below floor even if last counter is high', () => {
    const r = retentionOffer(baseCtx({ originalPrice: 1000, minPrice: 900 }), 999)
    expect(r.counterOffer).toBeGreaterThanOrEqual(900)
  })

  it('clamps to just above the floor when last counter is already at floor', () => {
    const r = retentionOffer(baseCtx({ originalPrice: 1000, minPrice: 800 }), 800)
    expect(r.counterOffer).toBeGreaterThan(800)
  })

  it('uses persona-specific language', () => {
    const friendly = retentionOffer(baseCtx({ persona: 'friendly_shopkeeper' }), 950)
    const strict = retentionOffer(baseCtx({ persona: 'strict_negotiator' }), 950)
    const playful = retentionOffer(baseCtx({ persona: 'playful_friend' }), 950)

    expect(friendly.reply.toLowerCase()).toContain('friend')
    expect(strict.reply).toMatch(/stretch|your call/i)
    expect(playful.reply.toLowerCase()).toContain('wait')
    // Strict negotiator: no emojis, no "friend"
    expect(strict.reply).not.toContain('friend')
  })
})

// ── bulkFloorFactor ──

describe('bulkFloorFactor', () => {
  it('returns 1.0 for non-bulk quantities (0 or 1)', () => {
    expect(bulkFloorFactor(0)).toBe(1.0)
    expect(bulkFloorFactor(1)).toBe(1.0)
  })

  it('returns 1.0 for small multi-packs (2-4 units)', () => {
    expect(bulkFloorFactor(2)).toBe(1.0)
    expect(bulkFloorFactor(3)).toBe(1.0)
    expect(bulkFloorFactor(4)).toBe(1.0)
  })

  it('unlocks 5% deeper floor for 5-9 units', () => {
    expect(bulkFloorFactor(5)).toBe(0.95)
    expect(bulkFloorFactor(7)).toBe(0.95)
    expect(bulkFloorFactor(9)).toBe(0.95)
  })

  it('unlocks 10% deeper floor for 10-19 units', () => {
    expect(bulkFloorFactor(10)).toBe(0.90)
    expect(bulkFloorFactor(15)).toBe(0.90)
    expect(bulkFloorFactor(19)).toBe(0.90)
  })

  it('unlocks 15% deeper floor for 20+ units', () => {
    expect(bulkFloorFactor(20)).toBe(0.85)
    expect(bulkFloorFactor(50)).toBe(0.85)
    expect(bulkFloorFactor(1000)).toBe(0.85)
  })
})

// ── buildOpeningMessage (persona differentiation) ──

describe('buildOpeningMessage', () => {
  it('each persona has a distinct vocabulary / tone', () => {
    const friendly = buildOpeningMessage(baseCtx({ persona: 'friendly_shopkeeper' }))
    const strict = buildOpeningMessage(baseCtx({ persona: 'strict_negotiator' }))
    const playful = buildOpeningMessage(baseCtx({ persona: 'playful_friend' }))

    // Friendly: warm, invites a rate
    expect(friendly.toLowerCase()).toContain('deal')
    // Strict: professional, no exclamation storms
    expect(strict).toMatch(/fair offer|what price/i)
    expect(strict).not.toContain('😏')
    // Playful: cheeky tone. No persona uses emojis.
    expect(playful).toContain("What's your move")
    expect(playful).not.toContain('😏')
  })

  it('shows the listed price but never the attempt budget in every persona', () => {
    const cases = ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend'] as const
    for (const persona of cases) {
      const msg = buildOpeningMessage(baseCtx({ persona, maxAttempts: 4, originalPrice: 1299 }))
      expect(msg).toContain('₹1299.00')
      expect(msg).not.toMatch(/\d+\s*(?:attempts?|shots?|mauke|exchanges?|mau\w*)/i)
      expect(msg).not.toContain('4')
    }
  })

  it('uses product title when provided', () => {
    const msg = buildOpeningMessage(baseCtx({ productTitle: 'Vitamin C Serum' }))
    expect(msg.toLowerCase()).toContain('serum')
  })

  it('welcomes returning customers', () => {
    const friendly = buildOpeningMessage(baseCtx({ customerContext: 'Returning customer — bought Vitamin C Serum' }))
    const strict = buildOpeningMessage(baseCtx({ persona: 'strict_negotiator', customerContext: 'Returning customer' }))
    const playful = buildOpeningMessage(baseCtx({ persona: 'playful_friend', customerContext: 'Returning customer' }))

    // Each persona acknowledges return in its own voice
    expect(friendly.toLowerCase()).toMatch(/again|back|see you/)
    expect(strict.toLowerCase()).toMatch(/back|welcome|return/)
    expect(playful.toLowerCase()).toMatch(/back|round 2|welcome back|again/)
  })
})

// ── tactical pacing (concede slowly; reward real interest) ──

describe('tacticalProgress', () => {
  it('is convex — slows early progress and reaches 1 only at the end', () => {
    expect(tacticalProgress(0)).toBe(0)
    expect(tacticalProgress(1)).toBe(1)
    // At one third of the rounds, barely a tenth of the range has moved.
    expect(tacticalProgress(1 / 3)).toBeLessThan(0.2)
    // Monotonic.
    expect(tacticalProgress(0.25)).toBeLessThan(tacticalProgress(0.5))
    expect(tacticalProgress(0.5)).toBeLessThan(tacticalProgress(0.75))
  })

  it('clamps out-of-range input', () => {
    expect(tacticalProgress(-1)).toBe(0)
    expect(tacticalProgress(2)).toBe(1)
  })
})

describe('tacticalCounter — the discount must be earned', () => {
  const ctx = (over: Partial<NegotiationContext> = {}): NegotiationContext => ({
    storeName: 'Test Store',
    currencySymbol: '₹',
    originalPrice: 1000,
    minPrice: 800,
    attemptsUsed: 0,
    maxAttempts: 3,
    persona: 'friendly_shopkeeper',
    ...over,
  })

  it('anchors at the listed price on the opening round (no panic discount)', () => {
    expect(tacticalCounter(ctx({ attemptsUsed: 0 }))).toBe(1000)
  })

  it('keeps the first counter well clear of the floor (the live ₹850 bug)', () => {
    // Round 1 of 3: the old AI freely said ₹850 (~25% off). Pacing holds ~₹967.
    const first = tacticalCounter(ctx({ attemptsUsed: 1 }))
    expect(first).toBeGreaterThan(950)
    expect(first).toBeLessThan(1000)
  })

  it('descends round over round but never below the safe quoted floor', () => {
    const floor = quotedFloor(ctx())
    const r1 = tacticalCounter(ctx({ attemptsUsed: 0 }))
    const r2 = tacticalCounter(ctx({ attemptsUsed: 1 }))
    const r3 = tacticalCounter(ctx({ attemptsUsed: 2 }))
    expect(r1).toBeGreaterThan(r2)
    expect(r2).toBeGreaterThan(r3)
    expect(r3).toBeGreaterThanOrEqual(floor)
    expect(r3).toBeGreaterThan(800) // never the hidden floor itself
  })

  it('rewards a serious buyer with more movement than a time-waster', () => {
    const base = ctx({ attemptsUsed: 1 })
    const serious = tacticalCounter({ ...base, seriousness: 'serious' })
    const casual = tacticalCounter({ ...base, seriousness: 'casual' })
    const waster = tacticalCounter({ ...base, seriousness: 'time_waster' })
    expect(serious).toBeLessThanOrEqual(casual)
    expect(casual).toBeLessThanOrEqual(waster)
  })

  it('rewards real upward movement in the shopper\'s own offers', () => {
    const base = ctx({ attemptsUsed: 1 })
    const rising = tacticalCounter({ ...base, customerOfferTrend: 'rising' })
    const flat = tacticalCounter({ ...base, customerOfferTrend: 'flat' })
    expect(rising).toBeLessThan(flat)
  })

  it('quotes the floor in the flat-range edge case rather than the floor itself', () => {
    const flat = ctx({ originalPrice: 800, minPrice: 800 })
    expect(tacticalCounter(flat)).toBe(quotedFloor(flat))
  })
})

