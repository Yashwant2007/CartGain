import { GENESIS_PRICE_CONTEXT } from './types'

const CONTROL_PATTERN = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g
const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{4,}|Bearer\s+[A-Za-z0-9._-]{4,}|(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*\S+|OPENAI_API_KEY|GROQ_API_KEY|AI_FALLBACK_API_KEY|LINK_SECRET|AI_PROVIDER|[A-Za-z0-9_-]{40,})/i
const PRICING_TERM_PATTERN = /hidden\s+(?:minimum|floor|base|lowest)\s+price|(?:minimum|floor|base|lowest)\s+price/gi

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const FLOOR_VALUES = [
  GENESIS_PRICE_CONTEXT.floorPrice.toFixed(2),
  GENESIS_PRICE_CONTEXT.floorPrice.toFixed(1),
  (GENESIS_PRICE_CONTEXT.floorPrice - 0.01).toFixed(2),
]
const FLOOR_REDACTION_PATTERN = new RegExp(Array.from(new Set(FLOOR_VALUES)).map(escapeRegExp).join('|'), 'g')

export function containsSecretMaterial(text: string): boolean {
  return SECRET_PATTERN.test(text)
}

export function containsFloorLiteral(text: string): boolean {
  return text.includes(FLOOR_VALUES[0]) || text.includes(FLOOR_VALUES[1])
}

export function normalizeBoundedText(text: unknown, maxChars: number): string {
  const value = typeof text === 'string' ? text : ''
  return value.replace(CONTROL_PATTERN, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

export function sanitizeShopperMessage(text: string, maxChars: number): string {
  const normalized = normalizeBoundedText(text, maxChars * 2)
  const withoutFloor = normalized.replace(FLOOR_REDACTION_PATTERN, '[redacted amount]')
  const withoutTerms = withoutFloor.replace(PRICING_TERM_PATTERN, '[redacted pricing term]')
  const withoutSecrets = withoutTerms.replace(new RegExp(SECRET_PATTERN.source, 'gi'), '[redacted]')
  return normalizeBoundedText(withoutSecrets, maxChars) || '[empty message]'
}
