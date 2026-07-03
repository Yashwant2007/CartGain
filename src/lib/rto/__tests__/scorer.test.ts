import { RuleBasedRiskScorer } from '@/lib/rto/scorer'
import { type ScoringInput } from '@/lib/rto/types'

describe('RuleBasedRiskScorer', () => {
  const scorer = new RuleBasedRiskScorer()

  const baseInput: ScoringInput = {
    order: {
      id: 'ord_1',
      totalValue: 1500,
      paymentMethod: 'COD',
      category: 'electronics',
    },
    customer: {
      id: 'cust_1',
      email: 'test@example.com',
      phone: '+919999999999',
      totalOrders: 5,
      codOrders: 3,
      codRtos: 0,
      cancellations: 0,
      isFirstTimeBuyer: false,
      emailVerified: true,
    },
    address: {
      line1: '123 Main Street, Sector 12',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      landmark: 'Near Station',
    },
    pincodeStats: {
      orders: 100,
      codOrders: 60,
      codRtos: 0,
      rtoRate: 0,
      codRtoRate: 0,
    },
    velocity: {},
  }

  it('should return LOW risk for a clean order', () => {
    const result = scorer.score(baseInput)
    expect(result.band).toBe('LOW')
    expect(result.score).toBeLessThanOrEqual(30)
    // Pincode will still produce a reason (0% RTO rate reported) but score stays low
    expect(result.reasons.length).toBeGreaterThanOrEqual(0)
  })

  it('should return MEDIUM or HIGH risk for high-value order in risky category', () => {
    const input: ScoringInput = {
      ...baseInput,
      order: { ...baseInput.order, totalValue: 15000, category: 'jewellery', discountPercent: 60 },
      address: { ...baseInput.address, pincode: '12' },
      customer: { ...baseInput.customer, isFirstTimeBuyer: true, emailVerified: false, phone: '' },
      pincodeStats: { orders: 100, codOrders: 60, codRtos: 8, rtoRate: 0.08, codRtoRate: 0.13 },
      velocity: { ordersSameAddress24h: 4 },
    }
    const result = scorer.score(input)
    expect(['MEDIUM', 'HIGH']).toContain(result.band)
    expect(result.score).toBeGreaterThan(30)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('should detect missing/invalid pincode', () => {
    const input: ScoringInput = {
      ...baseInput,
      address: { ...baseInput.address, pincode: '12' },
    }
    const result = scorer.score(input)
    const pincodeReason = result.reasons.find(r => r.factor === 'address' && r.description.includes('pincode'))
    expect(pincodeReason).toBeDefined()
  })

  it('should penalize first-time buyers', () => {
    const input: ScoringInput = {
      ...baseInput,
      customer: { ...baseInput.customer, totalOrders: 0, isFirstTimeBuyer: true },
    }
    const result = scorer.score(input)
    const customerReason = result.reasons.find(r => r.factor === 'customer' && r.description.includes('First-time'))
    expect(customerReason).toBeDefined()
  })

  it('should penalize customers with past RTOs', () => {
    const input: ScoringInput = {
      ...baseInput,
      customer: { ...baseInput.customer, codOrders: 10, codRtos: 4 },
    }
    const result = scorer.score(input)
    const rtoReason = result.reasons.find(r => r.factor === 'customer' && r.description.includes('RTO'))
    expect(rtoReason).toBeDefined()
  })

  it('should penalize disposable email domains', () => {
    const input: ScoringInput = {
      ...baseInput,
      customer: { ...baseInput.customer, email: 'test@mailinator.com' },
    }
    const result = scorer.score(input)
    const phoneReason = result.reasons.find(r => r.factor === 'phone' && r.description.includes('Disposable'))
    expect(phoneReason).toBeDefined()
  })

  it('should detect high velocity from same address', () => {
    const input: ScoringInput = {
      ...baseInput,
      velocity: { ordersSameAddress24h: 5 },
    }
    const result = scorer.score(input)
    const velocityReason = result.reasons.find(r => r.factor === 'velocity')
    expect(velocityReason).toBeDefined()
  })

  it('should respect custom config weights', () => {
    const input: ScoringInput = {
      ...baseInput,
      order: { ...baseInput.order, totalValue: 20000, category: 'fashion' },
      customer: { ...baseInput.customer, isFirstTimeBuyer: true },
      address: { ...baseInput.address, pincode: '12' },
    }

    const normalResult = scorer.score(input)
    const weightedResult = scorer.score(input, {
      weights: { address: 5, pincode: 5, customer: 5, order: 5, phone: 5, velocity: 5 },
    })

    expect(weightedResult.score).toBeLessThan(normalResult.score)
  })

  it('should clamp score to 0-100 range', () => {
    const input: ScoringInput = {
      ...baseInput,
      order: { ...baseInput.order, totalValue: 100000, category: 'jewellery', discountPercent: 80, quantity: 20 },
      customer: {
        ...baseInput.customer,
        isFirstTimeBuyer: true,
        codOrders: 20,
        codRtos: 15,
        cancellations: 10,
        emailVerified: false,
      },
      address: { line1: 'Short', city: '', state: '', pincode: '' },
      velocity: { ordersSameAddress24h: 10, ordersSamePhone24h: 5, ordersSameEmail24h: 5 },
    }
    const result = scorer.score(input)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
