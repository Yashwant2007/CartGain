import {
  buildExecutablePrice,
  toMinorUnits,
  fromMinorUnits,
  exactPercentOff,
  chargedUnitPriceMinor,
  isAtOrAboveFloor,
  checkFloor,
  clampOrderPercentForProduct,
  type ExecutablePrice,
} from '@/lib/financial-safety'

// Deterministic pseudo-random generator so the fuzz test is reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = mulberry32(20260909)

function pickIn(min: number, max: number): number {
  return min + rnd() * (max - min)
}

describe('toMinorUnits / fromMinorUnits round-trip', () => {
  it('rounds 0.1+0.2 style drift to exact minor units', () => {
    expect(toMinorUnits(0.1 + 0.2)).toBe(30)
    expect(fromMinorUnits(30)).toBe(0.3)
  })

  it.each([[-1], [0], [NaN], [Infinity]])('rejects invalid amount %p', (v) => {
    expect(toMinorUnits(v as number)).toBe(0)
  })
})

describe('exactPercentOff round-trips through chargedUnitPriceMinor', () => {
  it.each([
    [1000, 700],
    [999.99, 750.5],
    [1234.56, 1000],
    [40, 33],
    [100000, 55000],
  ])('original=%p target=%p', (original, target) => {
    const pct = exactPercentOff(original, target)
    const charged = fromMinorUnits(chargedUnitPriceMinor(original, pct))
    // Percent is rounded to 2 decimals (~0.005% of price); tolerance scales.
    const tolerance = Math.max(0.011, target * 0.0001)
    expect(Math.abs(charged - target)).toBeLessThanOrEqual(tolerance)
  })

  it('clamps percent to [0,100]', () => {
    expect(exactPercentOff(1000, 0)).toBe(0)
    expect(exactPercentOff(1000, 5000)).toBe(0)
    expect(exactPercentOff(0, 5)).toBe(0)
  })
})

describe('buildExecutablePrice — merchant floor is mathematically enforced', () => {
  it('accepts a deal exactly at the floor', () => {
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 800, floorPrice: 800 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.unitPriceMinor).toBe(800 * 100)
      expect(r.unitPriceMinor).toBeGreaterThanOrEqual(r.floorMinor)
      expect(r.discountPercent).toBe(20)
      expect(r.minSubtotalMinor).toBe(1000 * 100)
      expect(r.bulkQuantity).toBe(1)
    }
  })

  it('rejects a deal below the floor — never silently charges the floor', () => {
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 799, floorPrice: 800 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below_floor')
  })

  it('rejects a deal that would charge more than the list price (tampered higher final)', () => {
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 1500, floorPrice: 800 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('final_price_exceeds_original')
  })

  it('rejects zero/negative finals', () => {
    for (const fin of [0, -1, -100]) {
      const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: fin, floorPrice: 800 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('invalid_final_price')
    }
  })

  it('binds the minimum subtotal to the negotiated bulk quantity', () => {
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 760, floorPrice: 760, bulkQuantity: 5 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.minSubtotalMinor).toBe(5000 * 100)
      expect(r.bulkQuantity).toBe(5)
    }
  })

  it('a bulk floor price charged on 1 unit is below the single-unit floor — subtotal binding prevents it', () => {
    // bulk floor = 90% of the 20%-margin floor at qty 10 → per-unit 720
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 720, floorPrice: 900 /* single-unit floor */, bulkQuantity: 10 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below_floor')
  })

  it('guards against the integer-percent rounding breach (the Math.round flaw)', () => {
    // floor 801.5: an integer percent of 20% would charge exactly 800 — BELOW the
    // floor. The exact-percent path charges 802 and the floor never breaks.
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 802, floorPrice: 801.5 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.unitPriceMinor).toBe(80200)
      expect(r.discountPercent).toBe(19.8)
      expect(r.unitPriceMinor).toBeGreaterThanOrEqual(r.floorMinor)
    }
  })

  it('clamps quantity to a sane maximum', () => {
    const r = buildExecutablePrice({ originalPrice: 1000, finalPrice: 500, floorPrice: 500, bulkQuantity: 9999 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bulkQuantity).toBe(100)
  })

  it('handles a fractional floor (thin-margin) without rounding below it', () => {
    for (const [orig, floor] of [[99.99, 89.98], [123.45, 104.93], [17.5, 15.93]]) {
      const r = buildExecutablePrice({ originalPrice: orig, finalPrice: floor, floorPrice: floor })
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.unitPriceMinor).toBeGreaterThanOrEqual(r.floorMinor)
      }
    }
  })
})

describe('buildExecutablePrice — property test: no input that clears the floor can round below it', () => {
  it('fuzzes 5000 deals and never returns a charged price below the floor when accepted', () => {
    for (let i = 0; i < 5000; i++) {
      const originalPrice = Math.round(pickIn(1, 500000) * 100) / 100
      const margin = pickIn(1, 60)
      const bulk = [undefined, 1, 2, 5, 10, 20, 100, 3, 7][i % 9]
      const factor = bulk == null || bulk < 2 ? 1 : bulk >= 20 ? 0.85 : bulk >= 10 ? 0.9 : bulk >= 5 ? 0.95 : 1
      const floorPrice = Math.max(1, Math.round(Math.min(originalPrice, originalPrice * (1 - margin / 100) * factor) * 100) / 100)
      // final anywhere in [floor, original]
      const finalPrice = Math.round(pickIn(floorPrice, originalPrice) * 100) / 100

      const r = buildExecutablePrice({ originalPrice, finalPrice, floorPrice, bulkQuantity: bulk })
      if (r.ok) {
        expect(r.unitPriceMinor).toBeGreaterThanOrEqual(r.floorMinor)
        expect(r.discountPercent).toBeGreaterThanOrEqual(0)
        expect(r.discountPercent).toBeLessThanOrEqual(100)
        expect(r.unitPriceMinor).toBeLessThanOrEqual(toMinorUnits(originalPrice))
        expect(r.minSubtotalMinor).toBe(toMinorUnits(originalPrice) * r.bulkQuantity)
        // percent round-trips: charged(original, percent) == unitPriceMinor
        expect(chargedUnitPriceMinor(originalPrice, r.discountPercent)).toBe(r.unitPriceMinor)
      } else {
        // The only legitimate rejection for in-[floor,original] finals is the
        // unresolvable under-0.01-unit case.
        const f = r as Extract<ExecutablePrice, { ok: false }>
        expect(f.reason).toBe('charge_below_floor_unresolvable')
      }
    }
  })

  it('never accepts a deal with final below floor, for any trial', () => {
    for (let i = 0; i < 2000; i++) {
      const originalPrice = Math.round(pickIn(10, 50000) * 100) / 100
      const floorPrice = originalPrice * pickIn(0.4, 0.99)
      const finalPrice = Math.round(pickIn(0.01, floorPrice - 0.01) * 100) / 100
      const r = buildExecutablePrice({ originalPrice, finalPrice, floorPrice })
      if (r.ok) {
        fail('below-floor deal was accepted')
      }
    }
  })
})

describe('checkFloor — fail-fast pre-check', () => {
  it('flags below-floor and above-original', () => {
    expect(checkFloor(1000, 799, 800)).toEqual({ ok: false, reason: 'below_floor' })
    expect(checkFloor(1000, 1001, 800)).toEqual({ ok: false, reason: 'final_price_exceeds_original' })
    expect(checkFloor(1000, 800, 800)).toEqual({ ok: true })
  })
})

describe('clampOrderPercentForProduct — order-level codes can not exceed the margin floor', () => {
  it('allows a percent inside the margin', () => {
    const r = clampOrderPercentForProduct({ originalPrice: 1000, floorPrice: 800, requestedPercent: 15 })
    expect(r).toEqual({ ok: true, percent: 15 })
  })

  it('rejects a percent deeper than the floor allows', () => {
    const r = clampOrderPercentForProduct({ originalPrice: 1000, floorPrice: 800, requestedPercent: 25 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below_floor')
  })

  it('allows exactly the floor percent', () => {
    const r = clampOrderPercentForProduct({ originalPrice: 1000, floorPrice: 800, requestedPercent: 20 })
    expect(r.ok).toBe(true)
  })

  it('rejects invalid inputs', () => {
    expect(clampOrderPercentForProduct({ originalPrice: 0, floorPrice: 800, requestedPercent: 10 }).ok).toBe(false)
    expect(clampOrderPercentForProduct({ originalPrice: 1000, floorPrice: 800, requestedPercent: -5 }).ok).toBe(false)
    expect(clampOrderPercentForProduct({ originalPrice: 1000, floorPrice: 800, requestedPercent: 150 }).ok).toBe(false)
  })
})

describe('isAtOrAboveFloor', () => {
  it('compares in minor units', () => {
    expect(isAtOrAboveFloor(80000, 80000)).toBe(true)
    expect(isAtOrAboveFloor(79999, 80000)).toBe(false)
    expect(isAtOrAboveFloor(79990, 80000, 10)).toBe(true)
  })
})