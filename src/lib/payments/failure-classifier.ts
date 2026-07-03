import type { FailureCategory } from './types'
import { FAILURE_CATEGORY_RETRYABLE } from './types'

interface ClassificationRule {
  patterns: RegExp[]
  category: FailureCategory
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    patterns: [
      /bank.*(down|unavailable|error)/i,
      /issuer.*(down|unavailable)/i,
      /service.*unavailable/i,
      /bank.*decline/i,
    ],
    category: 'bank_downtime',
  },
  {
    patterns: [
      /upi.*(time.?out|expired)/i,
      /vpa.*invalid/i,
      /upi.*failed/i,
      /payment.*timeout/i,
    ],
    category: 'upi_timeout',
  },
  {
    patterns: [
      /otp.*(expired|invalid|wrong|failed)/i,
      /incorrect.*otp/i,
      /authentication.*failed/i,
    ],
    category: 'otp_failure',
  },
  {
    patterns: [
      /insufficient.*(fund|balance)/i,
      /low.*balance/i,
      /limit.*exceed/i,
    ],
    category: 'insufficient_funds',
  },
  {
    patterns: [
      /user.*(cancelled|abort|drop)/i,
      /cancelled.*by.*user/i,
      /payment.*cancelled/i,
      /closed/i,
    ],
    category: 'user_dropped',
  },
  {
    patterns: [
      /gateway.*(error|timeout|unavailable)/i,
      /processing.*error/i,
      /technical.*(error|glitch)/i,
      /system.*(error|failure)/i,
    ],
    category: 'gateway_error',
  },
]

export function classifyFailure(reasonRaw: string, method?: string): {
  category: FailureCategory
  retryable: boolean
} {
  if (!reasonRaw) return { category: 'unknown', retryable: FAILURE_CATEGORY_RETRYABLE.unknown }

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(reasonRaw)) {
        return {
          category: rule.category,
          retryable: FAILURE_CATEGORY_RETRYABLE[rule.category],
        }
      }
    }
  }

  if (method === 'upi') {
    return { category: 'upi_timeout', retryable: FAILURE_CATEGORY_RETRYABLE.upi_timeout }
  }

  return { category: 'unknown', retryable: FAILURE_CATEGORY_RETRYABLE.unknown }
}
