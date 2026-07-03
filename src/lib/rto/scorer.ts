import type { RiskScorer, RiskScore, ScoringInput, ScorerConfig, RiskFactor, RiskBand } from './types'
import { DEFAULT_SCORER_CONFIG } from './types'

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.com',
  'yopmail.com', 'sharklasers.com', '10minutemail.com', 'trashmail.com',
])

function scoreAddress(input: ScoringInput, _config: ScorerConfig): { score: number; reasons: RiskFactor[] } {
  const addr = input.address
  const reasons: RiskFactor[] = []
  let score = 0

  if (!addr.pincode || addr.pincode.length < 6) {
    score += 40
    reasons.push({ factor: 'address', weight: 40, score: 40, description: 'Missing or invalid pincode' })
  }
  if (!addr.line1 || addr.line1.length < 10) {
    score += 25
    reasons.push({ factor: 'address', weight: 25, score: 25, description: 'Address too short or missing' })
  }
  if (!addr.landmark && !addr.line2) {
    score += 20
    reasons.push({ factor: 'address', weight: 20, score: 20, description: 'No landmark or address line 2' })
  }
  if (!addr.city) {
    score += 15
    reasons.push({ factor: 'address', weight: 15, score: 15, description: 'City missing' })
  }

  return { score: Math.min(score, 100), reasons }
}

function scorePincode(input: ScoringInput, _config: ScorerConfig): { score: number; reasons: RiskFactor[] } {
  const reasons: RiskFactor[] = []
  let score = 0

  if (!input.pincodeStats) {
    score += 30
    reasons.push({ factor: 'pincode', weight: 30, score: 30, description: 'No pincode data available' })
    return { score, reasons }
  }

  if (input.pincodeStats.codOrders >= 10) {
    const ratePenalty = Math.round(input.pincodeStats.codRtoRate * 100)
    score += ratePenalty
    reasons.push({
      factor: 'pincode',
      weight: ratePenalty,
      score: ratePenalty,
      description: `Pincode COD RTO rate: ${(input.pincodeStats.codRtoRate * 100).toFixed(1)}%`,
    })
  } else {
    score += 15
    reasons.push({ factor: 'pincode', weight: 15, score: 15, description: 'Insufficient pincode history' })
  }

  return { score: Math.min(score, 100), reasons }
}

function scoreCustomer(input: ScoringInput, _config: ScorerConfig): { score: number; reasons: RiskFactor[] } {
  const cust = input.customer
  const reasons: RiskFactor[] = []
  let score = 0

  if (cust.isFirstTimeBuyer || (cust.totalOrders ?? 0) === 0) {
    score += 30
    reasons.push({ factor: 'customer', weight: 30, score: 30, description: 'First-time buyer' })
  }

  if ((cust.codRtos ?? 0) > 0 && (cust.codOrders ?? 0) > 0) {
    const rtoRatio = (cust.codRtos ?? 0) / (cust.codOrders ?? 0)
    const rtoPenalty = Math.round(rtoRatio * 50)
    score += rtoPenalty
    reasons.push({
      factor: 'customer',
      weight: rtoPenalty,
      score: rtoPenalty,
      description: `${cust.codRtos} RTO(s) out of ${cust.codOrders} COD order(s)`,
    })
  }

  if ((cust.cancellations ?? 0) > 2) {
    score += 20
    reasons.push({
      factor: 'customer',
      weight: 20,
      score: 20,
      description: `${cust.cancellations} past cancellations`,
    })
  }

  return { score: Math.min(score, 100), reasons }
}

function scoreOrder(input: ScoringInput, _config: ScorerConfig): { score: number; reasons: RiskFactor[] } {
  const order = input.order
  const reasons: RiskFactor[] = []
  let score = 0

  const HIGH_RISK_CATEGORIES = ['fashion', 'jewellery', 'nutraceuticals', 'footwear', 'lingerie']
  const category = (order.category || '').toLowerCase()
  if (HIGH_RISK_CATEGORIES.includes(category)) {
    score += 25
    reasons.push({ factor: 'order', weight: 25, score: 25, description: `High RTO category: ${category}` })
  }

  if (order.totalValue > 5000) {
    const valuePenalty = Math.min(Math.round(order.totalValue / 1000) * 2, 30)
    score += valuePenalty
    reasons.push({
      factor: 'order',
      weight: valuePenalty,
      score: valuePenalty,
      description: `High-value order: ₹${order.totalValue.toLocaleString('en-IN')}`,
    })
  }

  if ((order.discountPercent ?? 0) > 50) {
    score += 20
    reasons.push({
      factor: 'order',
      weight: 20,
      score: 20,
      description: `Deep discount: ${order.discountPercent}% off`,
    })
  }

  if ((order.quantity ?? 1) > 5) {
    score += 15
    reasons.push({ factor: 'order', weight: 15, score: 15, description: `Odd quantity: ${order.quantity} units` })
  }

  return { score: Math.min(score, 100), reasons }
}

function scorePhone(_input: ScoringInput, _config: ScorerConfig): { score: number; reasons: RiskFactor[] } {
  const reasons: RiskFactor[] = []
  let score = 0

  const email = (_input.customer.email || '').toLowerCase()
  const domain = email.split('@')[1]
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    score += 50
    reasons.push({ factor: 'phone', weight: 50, score: 50, description: 'Disposable email domain' })
  }

  if (_input.customer.emailVerified === false) {
    score += 30
    reasons.push({ factor: 'phone', weight: 30, score: 30, description: 'Unverified email' })
  }

  if (!_input.customer.phone) {
    score += 20
    reasons.push({ factor: 'phone', weight: 20, score: 20, description: 'No phone number' })
  }

  return { score: Math.min(score, 100), reasons }
}

function scoreVelocity(input: ScoringInput, _config: ScorerConfig): { score: number; reasons: RiskFactor[] } {
  const reasons: RiskFactor[] = []
  let score = 0

  if ((input.velocity.ordersSameAddress24h ?? 0) > 3) {
    score += 40
    reasons.push({
      factor: 'velocity',
      weight: 40,
      score: 40,
      description: `${input.velocity.ordersSameAddress24h} orders from same address in 24h`,
    })
  }

  if ((input.velocity.ordersSamePhone24h ?? 0) > 2) {
    score += 35
    reasons.push({
      factor: 'velocity',
      weight: 35,
      score: 35,
      description: `${input.velocity.ordersSamePhone24h} orders from same phone in 24h`,
    })
  }

  if ((input.velocity.ordersSameEmail24h ?? 0) > 2) {
    score += 25
    reasons.push({
      factor: 'velocity',
      weight: 25,
      score: 25,
      description: `${input.velocity.ordersSameEmail24h} orders from same email in 24h`,
    })
  }

  return { score: Math.min(score, 100), reasons }
}

function computeBand(score: number, config: ScorerConfig): RiskBand {
  if (score <= config.thresholds.low) return 'LOW'
  if (score <= config.thresholds.medium) return 'MEDIUM'
  return 'HIGH'
}

function riskScoreWeighted(
  dimensionScore: number,
  weight: number,
  _maxDimensionScore: number
): number {
  return Math.round((dimensionScore / 100) * weight)
}

export class RuleBasedRiskScorer implements RiskScorer {
  score(input: ScoringInput, partialConfig?: Partial<ScorerConfig>): RiskScore {
    const config: ScorerConfig = {
      ...DEFAULT_SCORER_CONFIG,
      ...partialConfig,
      weights: { ...DEFAULT_SCORER_CONFIG.weights, ...partialConfig?.weights },
      thresholds: { ...DEFAULT_SCORER_CONFIG.thresholds, ...partialConfig?.thresholds },
    }

    const addressResult = scoreAddress(input, config)
    const pincodeResult = scorePincode(input, config)
    const customerResult = scoreCustomer(input, config)
    const orderResult = scoreOrder(input, config)
    const phoneResult = scorePhone(input, config)
    const velocityResult = scoreVelocity(input, config)

    const allReasons: RiskFactor[] = [
      ...addressResult.reasons,
      ...pincodeResult.reasons,
      ...customerResult.reasons,
      ...orderResult.reasons,
      ...phoneResult.reasons,
      ...velocityResult.reasons,
    ]

    const totalScore =
      riskScoreWeighted(addressResult.score, config.weights.address, 100) +
      riskScoreWeighted(pincodeResult.score, config.weights.pincode, 100) +
      riskScoreWeighted(customerResult.score, config.weights.customer, 100) +
      riskScoreWeighted(orderResult.score, config.weights.order, 100) +
      riskScoreWeighted(phoneResult.score, config.weights.phone, 100) +
      riskScoreWeighted(velocityResult.score, config.weights.velocity, 100)

    const clampedScore = Math.max(0, Math.min(100, totalScore))
    const band = computeBand(clampedScore, config)

    return { score: clampedScore, band, reasons: allReasons }
  }
}

export const defaultScorer: RiskScorer = new RuleBasedRiskScorer()
