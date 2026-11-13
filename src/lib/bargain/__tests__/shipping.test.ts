import {
  normalizeShippingConfig,
  computeShipping,
  shippingPromptBlock,
  shippingUpsellLine,
} from '../shipping'

describe('normalizeShippingConfig', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(normalizeShippingConfig({}).enabled).toBe(false)
    expect(normalizeShippingConfig({ shippingAwareEnabled: false }).enabled).toBe(false)
    expect(normalizeShippingConfig({ shippingAwareEnabled: true }).enabled).toBe(true)
  })
  it('rejects negative / non-finite costs and non-positive thresholds', () => {
    expect(normalizeShippingConfig({ shippingFlatCost: -5 }).flatCost).toBe(0)
    expect(normalizeShippingConfig({ shippingFlatCost: NaN }).flatCost).toBe(0)
    expect(normalizeShippingConfig({ freeShippingThreshold: 0 }).freeThreshold).toBeNull()
    expect(normalizeShippingConfig({ freeShippingThreshold: -100 }).freeThreshold).toBeNull()
    expect(normalizeShippingConfig({ freeShippingThreshold: 999 }).freeThreshold).toBe(999)
  })
})

describe('computeShipping', () => {
  const config = normalizeShippingConfig({ shippingAwareEnabled: true, shippingFlatCost: 49, freeShippingThreshold: 1000 })

  it('adds flat shipping below the threshold and reports the gap', () => {
    const q = computeShipping({ config, unitPrice: 400, quantity: 1 })
    expect(q.subtotal).toBe(400)
    expect(q.shippingCost).toBe(49)
    expect(q.total).toBe(449)
    expect(q.freeShipping).toBe(false)
    expect(q.remainingForFreeShipping).toBe(600)
    expect(q.unitsForFreeShipping).toBe(2) // 2 units @400 = 800… no; 600/400 => ceil(1.5)=2
  })

  it('makes shipping free at or above the threshold', () => {
    const q = computeShipping({ config, unitPrice: 500, quantity: 2 })
    expect(q.subtotal).toBe(1000)
    expect(q.shippingCost).toBe(0)
    expect(q.freeShipping).toBe(true)
    expect(q.total).toBe(1000)
    expect(q.remainingForFreeShipping).toBe(0)
    expect(q.unitsForFreeShipping).toBeNull()
  })

  it('computes units-to-free-shipping from the unit price', () => {
    // 250/unit, threshold 1000 → 4 units exactly
    const q = computeShipping({ config: normalizeShippingConfig({ shippingAwareEnabled: true, shippingFlatCost: 30, freeShippingThreshold: 1000 }), unitPrice: 250, quantity: 1 })
    expect(q.remainingForFreeShipping).toBe(750)
    expect(q.unitsForFreeShipping).toBe(3) // 3 more units @250 = 750
  })

  it('never adds shipping when the feature is off', () => {
    const q = computeShipping({ config: normalizeShippingConfig({}), unitPrice: 400, quantity: 1 })
    expect(q.shippingCost).toBe(0)
    expect(q.total).toBe(400)
    expect(q.freeShipping).toBe(false)
  })

  it('handles a flat-cost-only config (no free threshold)', () => {
    const q = computeShipping({ config: normalizeShippingConfig({ shippingAwareEnabled: true, shippingFlatCost: 60 }), unitPrice: 100, quantity: 3 })
    expect(q.subtotal).toBe(300)
    expect(q.shippingCost).toBe(60)
    expect(q.total).toBe(360)
    expect(q.remainingForFreeShipping).toBe(0)
    expect(q.unitsForFreeShipping).toBeNull()
  })
})

describe('shippingPromptBlock', () => {
  it('is null when disabled', () => {
    expect(shippingPromptBlock(normalizeShippingConfig({}), '₹')).toBeNull()
  })
  it('states the real rule and the floor-protection warning, never a floor', () => {
    const block = shippingPromptBlock(normalizeShippingConfig({ shippingAwareEnabled: true, shippingFlatCost: 49, freeShippingThreshold: 1000 }), '₹')
    expect(block).toContain('₹49')
    expect(block).toContain('₹1000')
    expect(block).toContain('hidden system minimum')
    expect(block).not.toMatch(/floor|minPrice/i)
  })
})

describe('shippingUpsellLine', () => {
  const config = normalizeShippingConfig({ shippingAwareEnabled: true, shippingFlatCost: 49, freeShippingThreshold: 1000 })
  it('is null when disabled', () => {
    const q = computeShipping({ config: normalizeShippingConfig({}), unitPrice: 400, quantity: 1 })
    expect(shippingUpsellLine(q, '₹', { config: normalizeShippingConfig({}) })).toBeNull()
  })
  it('celebrates free shipping', () => {
    const q = computeShipping({ config, unitPrice: 1000, quantity: 1 })
    expect(shippingUpsellLine(q, '₹', { config })).toContain('on us')
  })
  it('suggests the truthful gap below the threshold', () => {
    const q = computeShipping({ config, unitPrice: 400, quantity: 1 })
    const line = shippingUpsellLine(q, '₹', { config })
    expect(line).toContain('₹600')
    expect(line).toContain('free shipping')
  })
})
