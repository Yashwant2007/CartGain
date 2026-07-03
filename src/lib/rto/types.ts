export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH'

export interface RiskFactor {
  factor: string
  weight: number
  score: number
  description: string
}

export interface RiskScore {
  score: number
  band: RiskBand
  reasons: RiskFactor[]
}

export interface AddressInfo {
  line1: string
  line2?: string
  city: string
  state: string
  pincode: string
  landmark?: string
  country?: string
}

export interface OrderInfo {
  id: string
  totalValue: number
  paymentMethod: string
  discountPercent?: number
  quantity?: number
  category?: string
  items?: { id: string; title: string; quantity: number; price: number; category?: string }[]
}

export interface CustomerInfo {
  id: string
  email?: string
  phone?: string
  totalOrders?: number
  codOrders?: number
  codRtos?: number
  cancellations?: number
  isFirstTimeBuyer?: boolean
  emailVerified?: boolean
}

export interface VelocitySignals {
  ordersSameAddress24h?: number
  ordersSamePhone24h?: number
  ordersSameEmail24h?: number
}

export interface ScoringInput {
  order: OrderInfo
  customer: CustomerInfo
  address: AddressInfo
  pincodeStats: { orders: number; codOrders: number; codRtos: number; rtoRate: number; codRtoRate: number } | null
  velocity: VelocitySignals
}

export interface ScorerConfig {
  weights: {
    address: number
    pincode: number
    customer: number
    order: number
    phone: number
    velocity: number
  }
  thresholds: {
    low: number
    medium: number
    high: number
  }
}

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
  weights: {
    address: 20,
    pincode: 20,
    customer: 25,
    order: 15,
    phone: 10,
    velocity: 10,
  },
  thresholds: {
    low: 30,
    medium: 60,
    high: 100,
  },
}

export interface RiskScorer {
  score(input: ScoringInput, config?: Partial<ScorerConfig>): RiskScore
}
