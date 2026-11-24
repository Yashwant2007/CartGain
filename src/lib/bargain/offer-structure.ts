import { exactPercentOff, fromMinorUnits, toMinorUnits } from '@/lib/financial-safety'
import { extractPrice, extractQuantity, normalizeCustomerText } from './text'

export type OfferBasis = 'none' | 'single' | 'per_unit' | 'total' | 'unclear' | 'multi_product'

export interface StructuredOffer {
  rawAmount: number | null
  unitPrice: number | null
  totalAmount: number | null
  quantity: number
  basis: OfferBasis
  needsClarification: boolean
  listTotal: number | null
  savingsAmount: number | null
  discountPercent: number | null
}

const WORD_COUNT: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const NON_COUNT_AFTER = /\b(?:days?|weeks?|months?|years?|hours?|hrs?|minutes?|mins?|seconds?|secs?|kids?|children|people|persons?|times?|reviews?|stars?|season|episode|chapter|level|model|version)\b/i

const PER_UNIT_RE = /\b(?:each|per\s+(?:unit|piece|item|pcs?|product)|a\s+piece|per\s+pcs?)\b/i

const TOTAL_RE = /\b(?:total|overall|all\s+together|in\s+total|together|the\s+(?:whole\s+)?lot|for\s+the\s+lot|for\s+all(?:\s+of\s+(?:them|these|those))?|all\s+(?:of\s+(?:them|these|those))?)\b/i

const SAME_SKU_TOTAL_RE = /\b(?:for|at)\s+(?:both|(?:the\s+)?(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|\d{1,2})\b(?!\s*(?:days?|weeks?|months?|years?|hours?|hrs?|minutes?|mins?|seconds?|secs?|kids?|children|people|persons?|times?|reviews?|stars?|model|version))/i

const BEFORE_COUNT_TOTAL_RE = /\b(?:(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|\d{1,2})\s*(?:units?|pcs?|pieces?|items?|of\s+these|of\s+them|of\s+those)\s+(?:for|cost(?:ing)?)\b/i

function countForSameSkuTotal(text: string): number | null {
  const matched = text.match(SAME_SKU_TOTAL_RE)
  if (matched) {
    const token = matched[0].split(/\s+/).pop() ?? ''
    if (token.toLowerCase() === 'both') return 2
    if (WORD_COUNT[token.toLowerCase()]) return WORD_COUNT[token.toLowerCase()]
    const numeric = parseInt(token.replace(/[^\d]/g, ''), 10)
    if (numeric >= 2 && numeric <= 100) return numeric
  }
  const before = text.match(BEFORE_COUNT_TOTAL_RE)
  if (before) {
    const token = before[0].match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/i)?.[1]
    if (token) {
      if (WORD_COUNT[token.toLowerCase()]) return WORD_COUNT[token.toLowerCase()]
      const numeric = parseInt(token, 10)
      if (numeric >= 2 && numeric <= 100) return numeric
    }
  }
  const allThree = text.match(/\ball\s+(?:of\s+(?:them|these|those)\s+)?(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/i)
  if (allThree) {
    const token = allThree[1]
    if (WORD_COUNT[token.toLowerCase()]) return WORD_COUNT[token.toLowerCase()]
    const numeric = parseInt(token, 10)
    if (numeric >= 2 && numeric <= 100) return numeric
  }
  if (/\bfor\s+both\b/i.test(text) || /\bboth\s+for\b/i.test(text)) return 2
  return null
}

const EXPLICIT_BUNDLE_RE = /\b(?:bundles?|combos?|package(?:\s+deal)?|value\s+set|plus)\b/i

export function isSameSkuTotalPhrase(text: string): boolean {
  const normalized = normalizeCustomerText(text)
  if (EXPLICIT_BUNDLE_RE.test(normalized)) return false
  return countForSameSkuTotal(normalized) !== null && extractPrice(normalized) !== null
}

function moneyContext(totalMinor: number, listUnitPrice: number | null | undefined, quantity: number) {
  if (!(totalMinor > 0) || !listUnitPrice || !Number.isFinite(listUnitPrice) || listUnitPrice <= 0) {
    return { listTotal: null, savingsAmount: null, discountPercent: null }
  }
  const listMinor = toMinorUnits(listUnitPrice) * quantity
  if (!(listMinor > 0)) return { listTotal: null, savingsAmount: null, discountPercent: null }
  return {
    listTotal: fromMinorUnits(listMinor),
    savingsAmount: fromMinorUnits(Math.max(0, listMinor - totalMinor)),
    discountPercent: exactPercentOff(fromMinorUnits(listMinor), fromMinorUnits(totalMinor)),
  }
}

export function parseStructuredOffer(
  text: string,
  contextQuantity?: number | null,
  listUnitPrice?: number | null,
): StructuredOffer {
  const normalized = normalizeCustomerText(text)
  const rawAmount = extractPrice(normalized)
  const messageQuantity = countForSameSkuTotal(normalized) ?? extractQuantity(normalized)
  const quantity = messageQuantity && messageQuantity >= 2
    ? messageQuantity
    : contextQuantity && contextQuantity >= 2
      ? Math.min(100, Math.floor(contextQuantity))
      : 1

  if (rawAmount == null) {
    return {
      rawAmount: null,
      unitPrice: null,
      totalAmount: null,
      quantity,
      basis: 'none',
      needsClarification: false,
      ...moneyContext(0, listUnitPrice, quantity),
    }
  }

  const rawMinor = toMinorUnits(rawAmount)
  if (PER_UNIT_RE.test(normalized)) {
    const unitMinor = toMinorUnits(rawAmount)
    return {
      rawAmount,
      unitPrice: fromMinorUnits(unitMinor),
      totalAmount: fromMinorUnits(unitMinor * quantity),
      quantity,
      basis: 'per_unit',
      needsClarification: false,
      ...moneyContext(unitMinor * quantity, listUnitPrice, quantity),
    }
  }

  const sameSkuTotal = countForSameSkuTotal(normalized) !== null || BEFORE_COUNT_TOTAL_RE.test(normalized)
  const explicitFinalTotal = /\bfinal\b/i.test(normalized) && messageQuantity != null && messageQuantity >= 2
  const totalCue = TOTAL_RE.test(normalized) || sameSkuTotal || explicitFinalTotal
  if (totalCue) {
    if (quantity < 2) {
      return {
        rawAmount,
        unitPrice: null,
        totalAmount: fromMinorUnits(rawMinor),
        quantity: 1,
        basis: 'unclear',
        needsClarification: true,
        ...moneyContext(rawMinor, listUnitPrice, 1),
      }
    }
    const unitMinor = Math.floor(rawMinor / quantity)
    return {
      rawAmount,
      unitPrice: fromMinorUnits(unitMinor),
      totalAmount: fromMinorUnits(rawMinor),
      quantity,
      basis: 'total',
      needsClarification: false,
      ...moneyContext(rawMinor, listUnitPrice, quantity),
    }
  }

  if (messageQuantity && messageQuantity >= 2) {
    return {
      rawAmount,
      unitPrice: null,
      totalAmount: fromMinorUnits(rawMinor),
      quantity: messageQuantity,
      basis: 'unclear',
      needsClarification: true,
      ...moneyContext(rawMinor, listUnitPrice, quantity),
    }
  }

  if (contextQuantity && contextQuantity >= 2) {
    return {
      rawAmount,
      unitPrice: null,
      totalAmount: fromMinorUnits(rawMinor),
      quantity: contextQuantity,
      basis: 'unclear',
      needsClarification: true,
      ...moneyContext(rawMinor, listUnitPrice, contextQuantity),
    }
  }

  return {
    rawAmount,
    unitPrice: fromMinorUnits(rawMinor),
    totalAmount: fromMinorUnits(rawMinor * quantity),
    quantity,
    basis: 'single',
    needsClarification: false,
    ...moneyContext(rawMinor * quantity, listUnitPrice, quantity),
  }
}
