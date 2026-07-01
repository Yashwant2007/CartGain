import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'

export type DataAccessActorType = 'system' | 'merchant' | 'staff' | 'service'

export interface DataAccessLogInput {
  actorType: DataAccessActorType
  action: string
  resourceType: string
  purpose: string
  actorId?: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

const SENSITIVE_KEY_PATTERNS = [
  /email/i,
  /phone/i,
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /api[_-]?key/i,
  /api[_-]?secret/i,
  /customer/i,
  /cart/i,
  /items?/i,
  /content/i,
  /body/i,
  /message/i,
]

function maskEmail(value: string): string {
  const [local, domain] = value.split('@')
  if (!local || !domain) return '[redacted]'
  return `${local.slice(0, 2)}***@${domain}`
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return '[redacted]'
  return `***${digits.slice(-4)}`
}

function maskString(value: string): string {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return maskEmail(value)
  if (/^\+?\d[\d\s()-]{7,}$/.test(value)) return maskPhone(value)
  if (value.length > 160) return `${value.slice(0, 24)}…[redacted]`
  return value
}

export function redactSensitive<T>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    return maskString(value) as T
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item, depth + 1)) as T
  }

  if (typeof value === 'object') {
    const input = value as Record<string, unknown>
    const output: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(input)) {
      if (SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))) {
        output[key] = '[redacted]'
        continue
      }

      output[key] = redactSensitive(nestedValue, depth + 1)
    }

    return output as T
  }

  return value
}

export async function logDataAccess(input: DataAccessLogInput): Promise<void> {
  try {
    await prisma.dataAccessLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        purpose: input.purpose,
        metadata: input.metadata ? (redactSensitive(input.metadata) as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (error) {
    console.error('Failed to write data access log:', error)
  }
}