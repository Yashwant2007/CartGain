export type GatewayName = 'razorpay' | 'cashfree' | 'payu' | 'stripe'

export type FailureCategory =
  | 'bank_downtime'
  | 'upi_timeout'
  | 'otp_failure'
  | 'insufficient_funds'
  | 'user_dropped'
  | 'gateway_error'
  | 'unknown'

export interface GatewayPaymentEvent {
  id: string
  gateway: GatewayName
  gatewayEventId: string
  orderRef: string
  merchantId: string
  amount: number
  currency: string
  status: 'failed' | 'success'
  failureReasonRaw?: string
  gatewayResponse?: Record<string, unknown>
  method?: string
}

export interface PaymentRecoveryConfig {
  enabled: boolean
  enabledGateways: GatewayName[]
  retrySchedule: Record<FailureCategory, { delayMinutes: number; maxRetries: number }>
  channelPriority: string[]
  incentive: number
}

export const DEFAULT_RETRY_SCHEDULE: Record<FailureCategory, { delayMinutes: number; maxRetries: number }> = {
  bank_downtime: { delayMinutes: 30, maxRetries: 3 },
  upi_timeout: { delayMinutes: 5, maxRetries: 2 },
  otp_failure: { delayMinutes: 2, maxRetries: 2 },
  insufficient_funds: { delayMinutes: 60, maxRetries: 3 },
  user_dropped: { delayMinutes: 10, maxRetries: 1 },
  gateway_error: { delayMinutes: 15, maxRetries: 2 },
  unknown: { delayMinutes: 30, maxRetries: 1 },
}

export const FAILURE_CATEGORY_RETRYABLE: Record<FailureCategory, boolean> = {
  bank_downtime: true,
  upi_timeout: true,
  otp_failure: true,
  insufficient_funds: true,
  user_dropped: true,
  gateway_error: true,
  unknown: false,
}

export interface GatewayAdapter {
  name: GatewayName
  verifyWebhookSignature(body: string, headers: Headers): boolean
  parseEvent(body: string, headers: Headers): GatewayPaymentEvent | null
}
