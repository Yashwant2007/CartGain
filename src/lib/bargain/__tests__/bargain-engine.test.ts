import {
  ruleBasedDecision,
  retentionOffer,
  bulkFloorFactor,
  buildOpeningMessage,
  type NegotiationContext,
} from '../../services/bargain'

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

  it('counters for absurdly low offers (< 30% of floor) without jumping to floor', () => {
    const r = ruleBasedDecision(50, baseCtx({ attemptsUsed: 0 }))
    expect(r.decision).toBe('counter')
    expect(r.tactic).toBe('graduated_open')
    // First-attempt counter should be near the original price, not the floor
    expect(r.counterOffer).toBeGreaterThan(800)
  })

  it('gives the floor price on the final attempt', () => {
    const r = ruleBasedDecision(500, baseCtx({ attemptsUsed: 2, maxAttempts: 3 }))
    expect(r.decision).toBe('counter')
    expect(r.counterOffer).toBe(800)
    expect(r.tactic).toBe('final_offer')
  })

  it('graduates counters — later attempts yield lower counter prices', () => {
    const r1 = ruleBasedDecision(700, baseCtx({ attemptsUsed: 0 }))
    const r2 = ruleBasedDecision(700, baseCtx({ attemptsUsed: 1 }))
    const r3 = ruleBasedDecision(700, baseCtx({ attemptsUsed: 2, maxAttempts: 3 }))
    expect(r1.counterOffer).toBeGreaterThan(r2.counterOffer!)
    expect(r2.counterOffer).toBeGreaterThan(r3.counterOffer!)
    expect(r3.counterOffer).toBe(800) // last attempt = floor
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

  it('clamps to floor when last counter is already at floor', () => {
    const r = retentionOffer(baseCtx({ originalPrice: 1000, minPrice: 800 }), 800)
    expect(r.counterOffer).toBe(800)
  })

  it('uses persona-specific language', () => {
    const friendly = retentionOffer(baseCtx({ persona: 'friendly_shopkeeper' }), 950)
    const strict = retentionOffer(baseCtx({ persona: 'strict_negotiator' }), 950)
    const playful = retentionOffer(baseCtx({ persona: 'playful_friend' }), 950)

    expect(friendly.reply.toLowerCase()).toContain('friend')
    expect(strict.reply).toMatch(/one[- ]time adjustment|stand|prepared/i)
    expect(playful.reply.toLowerCase()).toContain('risk')
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

    // Friendly: warm, mentions attempts to bargain
    expect(friendly.toLowerCase()).toContain('deal')
    // Strict: professional, no exclamation storms
    expect(strict).toMatch(/reasonable offers|what price|within \d+ exchanges/i)
    expect(strict).not.toContain('😏')
    // Playful: emoji + cheeky tone
    expect(playful).toContain('😏')
  })

  it('includes original price and max attempts in every persona', () => {
    const cases = ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend'] as const
    for (const persona of cases) {
      const msg = buildOpeningMessage(baseCtx({ persona, maxAttempts: 4, originalPrice: 1299 }))
      expect(msg).toContain('₹1299.00')
      expect(msg).toContain('4')
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
