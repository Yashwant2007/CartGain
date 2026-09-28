/**
 * Storefront ⇄ demo parity.
 *
 * The /demo negotiation window and the dashboard demo panel are `'use client'`
 * components, so they cannot import `lib/services/bargain` (it pulls the OpenAI
 * SDK). They therefore fell back to `lib/bargain/engine`'s own copy of the
 * rule-based decision, which had drifted from the server's version: it quoted
 * the merchant's exact floor and announced it as "the lowest I can go".
 *
 * Both surfaces now share one implementation. These tests exist so the two can
 * never silently diverge again, and so the floor can never be spoken aloud on
 * the no-AI path — which is exactly the path a shopper sees during an outage.
 */
import {
  ruleBasedDecision as engineRuleBasedDecision,
  retentionOffer as engineRetentionOffer,
  quotedFloor,
  type NegotiationContext as EngineContext,
} from '../engine'
import {
  ruleBasedDecision as serverRuleBasedDecision,
  retentionOffer as serverRetentionOffer,
  quotedFloor as serverQuotedFloor,
} from '@/lib/services/bargain'

const PERSONAS = ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend'] as const

function ctx(over: Partial<EngineContext> = {}): EngineContext {
  return {
    storeName: 'Lumina Beauty',
    currencySymbol: '₹',
    originalPrice: 600,
    minPrice: 300,
    attemptsUsed: 3,
    maxAttempts: 3,
    persona: 'friendly_shopkeeper',
    ...over,
  }
}

/** Phrases that pin the merchant's private minimum to the customer. */
const LEAK_PATTERNS = [
  /lowest i can go/i,
  /absolute (floor|minimum|lowest)/i,
  /my (true )?cost/i,
  /break[-\s]?even/i,
  /margin/i,
  /this is my (final|lowest) price/i,
]

function assertFloorSafe(reply: string, c: EngineContext) {
  for (const re of LEAK_PATTERNS) {
    expect(reply).not.toMatch(re)
  }
  // The exact floor must never appear in the text, and must never be quoted
  // back as a counter.
  expect(reply).not.toContain(c.minPrice.toFixed(2))
}

describe('no-AI fallback keeps the floor secret (the path shoppers see during an outage)', () => {
  it('never says the quoted price is the lowest it can go', () => {
    // attemptsUsed === maxAttempts forces the "final position" branch.
    for (const persona of PERSONAS) {
      for (const [minPrice, originalPrice] of [
        [300, 600],
        [450.5, 900],
        [999, 2000],
        [1234.56, 3000],
      ] as const) {
        const c = ctx({ persona, minPrice, originalPrice })
        const r = engineRuleBasedDecision(minPrice * 0.5, c)
        expect(r.reply).not.toMatch(/lowest i can go/i)
        assertFloorSafe(r.reply, c)
      }
    }
  })

  it('quotes above the floor, never at it', () => {
    const c = ctx()
    const r = engineRuleBasedDecision(200, c) // 200 < 300 floor, last attempt
    expect(r.decision).toBe('counter')
    expect(r.counterOffer).toBeGreaterThan(c.minPrice)
    expect(r.counterOffer).toBe(quotedFloor(c))
    expect(r.counterOffer).not.toBe(c.minPrice)
  })

  it('still honours a customer offer at exactly the floor (accept rule is separate from secrecy)', () => {
    const c = ctx()
    const r = engineRuleBasedDecision(c.minPrice, c)
    expect(r.decision).toBe('accept')
    expect(r.counterOffer).toBe(c.minPrice)
  })

  it('never lets a counter or retention price dip below the safe quote', () => {
    for (const attemptsUsed of [0, 1, 2, 3]) {
      const c = ctx({ attemptsUsed })
      const floor = quotedFloor(c)
      for (const offer of [1, 50, 299, 300, 450, 599]) {
        const r = engineRuleBasedDecision(offer, c)
        if (r.decision === 'counter') {
          expect(r.counterOffer!).toBeGreaterThanOrEqual(floor)
        }
      }
      for (const lastCounter of [null, 600, 450, 320, 305]) {
        const ret = engineRetentionOffer(c, lastCounter)
        expect(ret.counterOffer!).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('ignores absurd and hostile offer values without leaking', () => {
    const c = ctx()
    for (const bad of [-1, -99999, NaN, Infinity, 0]) {
      const r = engineRuleBasedDecision(bad, c)
      expect(Number.isFinite(r.counterOffer!)).toBe(true)
      expect(r.counterOffer!).toBeGreaterThanOrEqual(quotedFloor(c))
    }
  })
})

describe('storefront ⇄ demo parity', () => {
  it('quotedFloor is identical on both surfaces', () => {
    for (const [min, orig] of [[300, 600], [1, 2], [99.99, 100], [450.5, 451]] as const) {
      expect(serverQuotedFloor({ minPrice: min, originalPrice: orig })).toBe(
        quotedFloor({ minPrice: min, originalPrice: orig }),
      )
    }
  })

  it('produces identical decisions, prices, tactics and copy for every offer × persona', () => {
    for (const persona of PERSONAS) {
      for (const attemptsUsed of [0, 1, 2, 3]) {
        for (const offer of [1, 89, 250, 300, 450, 600, 9999]) {
          const c = ctx({ persona, attemptsUsed })
          const demo = engineRuleBasedDecision(offer, c)
          const store = serverRuleBasedDecision(offer, c)
          expect(store).toEqual(demo)
        }
      }
    }
  })

  it('produces identical retention offers for every persona', () => {
    for (const persona of PERSONAS) {
      for (const lastCounter of [null, 600, 450, 320]) {
        const c = ctx({ persona })
        expect(serverRetentionOffer(c, lastCounter)).toEqual(engineRetentionOffer(c, lastCounter))
      }
    }
  })

  it('the demo fallback cannot emit the old leaky final-offer line', () => {
    // Exact string that shipped in engine.ts and was visible in /demo.
    const r = engineRuleBasedDecision(200, ctx())
    expect(r.reply).not.toContain('It\'s the lowest I can go')
    expect(r.reply).not.toContain('Take it or leave it')
  })
})
