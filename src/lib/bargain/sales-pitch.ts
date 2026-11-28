import type { ProductContext } from './product-context'

export type ComparisonPitchContext = {
  persona?: 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'
  productTitle?: string
  product?: ProductContext
  listedPrice?: string | null
}

const VALUE_PATTERN =
  /\b(quality|genuine|authentic|warranty|guarantee|replacement|return|support|material|fabric|durable|lightweight|feature|benefit|fit|type|brand|vendor|shipping|delivery|includes?|included|value|worth|crafted|designed|made|finish|size|stock|available|care|wash|composition)\b/i

const CLOSE_PATTERN =
  /\b(shall i|shall we|would you like|ready to|lock|confirm|go ahead|take it|done|deal|decide|suits you|works for you|want me to|should i|can i|let me know)\b/i

const DISMISSIVE_PATTERN =
  /^(?:nice try|ha+|hah|nice one|come on|you'll have to do better|that'?s not serious|not a serious offer)\b[^.!?]*[.!?]\s*/i

function cleanFact(value: unknown, max = 130): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed
}

function factList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

export function verifiedProductFact(ctx: ComparisonPitchContext): string | null {
  const product = ctx.product
  if (!product || product.fetchFailed) return null
  const approved = factList(product.merchantApprovedSellingPoints).map((p) => cleanFact(p)).filter(Boolean)
  if (approved.length > 0) return approved[0] as string
  const description = cleanFact(product.description, 150)
  if (description) return description
  const identity = [cleanFact(product.vendor, 40), cleanFact(product.productType, 40)].filter(Boolean).join(' ')
  if (identity) return identity
  const tags = factList(product.tags).map((tag) => cleanFact(tag, 40)).filter(Boolean).slice(0, 3)
  if (tags.length > 0) return tags.join(', ')
  return cleanFact(product.title || ctx.productTitle, 80)
}

function pitchLine(ctx: ComparisonPitchContext): string {
  const fact = verifiedProductFact(ctx)
  return fact
    ? `I can't verify prices elsewhere, but here I can stand behind the value: ${fact}.`
    : "I can't verify prices elsewhere, but I can stand behind the price I've offered here."
}

function closeLine(ctx: ComparisonPitchContext): string {
  if (ctx.persona === 'strict_negotiator') return 'Confirm if you would like me to lock this in.'
  if (ctx.persona === 'playful_friend') return 'Shall I lock it in and get this sorted?'
  return 'Shall I lock it in for you?'
}

function splitSentences(reply: string): string[] {
  return reply.match(/[^.!?]+[.!?]?\s*/g) ?? [reply]
}

function salesPitchClose(ctx: ComparisonPitchContext): string {
  if (ctx.persona === 'strict_negotiator') return 'If that fits your need, I can review a fair offer.'
  if (ctx.persona === 'playful_friend') return 'If that sounds like your kind of thing, I can make the next step easy.'
  return 'If that fits what you were looking for, I can help you take the next step.'
}

export function buildSalesPitch(ctx: ComparisonPitchContext): string {
  const title = cleanFact(ctx.product?.title || ctx.productTitle, 80) || 'this item'
  const candidate = verifiedProductFact(ctx)
  const fact = candidate && candidate.toLowerCase() !== title.toLowerCase() ? candidate : null
  const listed = cleanFact(ctx.listedPrice, 40)
  const lead = fact
    ? `Fair question. For ${title}, what I can honestly stand behind is this: ${fact}.`
    : `Fair question. I won't invent reasons to buy ${title}, but I can help you judge it against what matters to you.`
  const priceLine = listed ? ` It's listed at ${listed}, so you know exactly what we're working from.` : ''
  return `${lead}${priceLine} ${salesPitchClose(ctx)}`
}

export function strengthenComparisonPitch(reply: string, ctx: ComparisonPitchContext): string {
  const trimmed = reply.trim()
  if (!trimmed) return reply
  const pitch = pitchLine(ctx)
  const dismissive = DISMISSIVE_PATTERN.test(trimmed)

  if (!dismissive && VALUE_PATTERN.test(trimmed) && CLOSE_PATTERN.test(trimmed)) {
    return reply
  }

  const base = dismissive ? trimmed.replace(DISMISSIVE_PATTERN, `${pitch} `).trim() : trimmed
  if (CLOSE_PATTERN.test(base)) {
    if (VALUE_PATTERN.test(base) && !dismissive) return base
    const parts = splitSentences(base)
    const index = parts.findIndex((part) => CLOSE_PATTERN.test(part))
    if (index >= 0) {
      parts.splice(index, 0, `${pitch} `)
      return parts.join('').trim()
    }
  }
  return `${base} ${pitch} ${closeLine(ctx)}`.trim()
}
