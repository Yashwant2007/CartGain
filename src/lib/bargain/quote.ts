// ── Secure bargain quotes (Module 3) ────────────────────────
// The authoritative, server-issued price lock for an accepted bargain.
//
// Why a first-party record when Shopify already issues a single-use discount
// code: the code is the executable artifact, but it cannot carry our lifecycle,
// our audit trail, our buyer binding beyond Shopify's own, or a revocation
// switch. A quote is that record. It is bound to an unguessable, HMAC-signed
// token (the only id a client ever sees), moves through an explicit state
// machine, is single-use via an atomic compare-and-swap, expires, and can be
// revoked/invalidated by the merchant or by a policy event.
//
// Everything here is additive: the legacy discount-code-only path keeps working
// when the BARGAIN_QUOTE flag is off, and these functions only ever touch the
// two new tables.
import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateSecureToken, verifySecureToken } from '@/lib/links'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { exactPercentOff } from '@/lib/financial-safety'

export const QUOTE_STATUSES = [
  'CREATED',
  'ACCEPTED',
  'CHECKOUT_PENDING',
  'REDEEMED',
  'EXPIRED',
  'REVOKED',
  'INVALIDATED',
  'CANCELLED',
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

// 24h matches the Shopify discount code window, so the quote and the code
// always expire together.
export const QUOTE_TTL_MS = 24 * 60 * 60 * 1000
const QUOTE_TOKEN_PREFIX = 'bquote:'

// Forward-only state machine. Every other transition is a conflict. Terminal
// states have no outgoing edges, which is what makes REDEEMED/REVOKED/… final.
const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  CREATED: ['ACCEPTED', 'EXPIRED', 'REVOKED', 'INVALIDATED', 'CANCELLED'],
  ACCEPTED: ['CHECKOUT_PENDING', 'REDEEMED', 'EXPIRED', 'REVOKED', 'INVALIDATED', 'CANCELLED'],
  CHECKOUT_PENDING: ['REDEEMED', 'EXPIRED', 'REVOKED', 'INVALIDATED', 'CANCELLED'],
  REDEEMED: [],
  EXPIRED: [],
  REVOKED: [],
  INVALIDATED: [],
  CANCELLED: [],
}

// Reverse index (which source states may reach `to`) — the CAS `where` clause.
const REVERSE: Record<QuoteStatus, QuoteStatus[]> = (() => {
  const out = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, [] as QuoteStatus[]])) as Record<QuoteStatus, QuoteStatus[]>
  for (const from of QUOTE_STATUSES) {
    for (const to of TRANSITIONS[from]) out[to].push(from)
  }
  return out
})()

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === 'string' && (QUOTE_STATUSES as readonly string[]).includes(value)
}

export function isTerminal(status: QuoteStatus): boolean {
  return TRANSITIONS[status]?.length === 0
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

/** Sign a tamper-proof token bound to exactly one quote id. Null when no secret is set. */
export function signQuoteToken(quoteId: string): string | null {
  try {
    return generateSecureToken(`${QUOTE_TOKEN_PREFIX}${quoteId}`)
  } catch {
    return null
  }
}

/** True when `token` is a valid, unexpired token for exactly this quote id. */
export function verifyQuoteToken(quoteId: string, token: string | null | undefined): boolean {
  if (!token) return false
  const data = verifySecureToken(token, QUOTE_TTL_MS)
  return data === `${QUOTE_TOKEN_PREFIX}${quoteId}`
}

export interface QuoteLifecycleShape {
  status: string
  expiresAt: Date
}

/** Past its window (or already EXPIRED) and not already in another terminal state. */
export function isExpired(quote: QuoteLifecycleShape, now: Date = new Date()): boolean {
  if (quote.status === 'EXPIRED') return true
  if (isQuoteStatus(quote.status) && isTerminal(quote.status)) return false
  return quote.expiresAt.getTime() <= now.getTime()
}

// ── Checkout-time revalidation (pure) ───────────────────────
export type RevalidationFailure =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'TERMINAL'
  | 'PRICE_DRIFT'
  | 'BELOW_FLOOR'
  | 'UNDERPAID'

export type RevalidationVerdict =
  | { ok: true }
  | { ok: false; reason: RevalidationFailure }

/**
 * Decide whether a quote is still honourable at checkout against the CURRENT
 * authoritative price/floor. Rejects drift (the merchant changed the price),
 * a floor that has moved above the agreed price, and an agreed price that is
 * somehow below the floor. `toleranceRatio` matches the checkout-accept drift
 * guard (0.5%).
 */
export function revalidateQuote(
  quote: { status: string; expiresAt: Date; originalPrice: number; finalPrice: number },
  current: { price: number; floor: number },
  now: Date = new Date(),
  toleranceRatio = 0.005,
): RevalidationVerdict {
  if (isQuoteStatus(quote.status) && isTerminal(quote.status)) {
    return { ok: false, reason: quote.status === 'EXPIRED' ? 'EXPIRED' : 'TERMINAL' }
  }
  if (isExpired(quote, now)) return { ok: false, reason: 'EXPIRED' }
  if (current.price <= 0) return { ok: false, reason: 'PRICE_DRIFT' }
  const ratio = quote.originalPrice / current.price
  if (ratio < 1 - toleranceRatio || ratio > 1 + toleranceRatio) {
    return { ok: false, reason: 'PRICE_DRIFT' }
  }
  if (quote.finalPrice < current.floor) return { ok: false, reason: 'BELOW_FLOOR' }
  if (quote.finalPrice > current.price) return { ok: false, reason: 'UNDERPAID' }
  return { ok: true }
}

// ── Persistence ─────────────────────────────────────────────

export interface CreateQuoteInput {
  storeId: string
  sessionId?: string | null
  cartToken?: string | null
  shopifyProductId: string
  variantId?: string | null
  quantity?: number
  originalPrice: number
  finalPrice: number
  discountPercent: number
  floorPrice: number
  currency?: string
  customerEmail?: string | null
  shopifyCustomerId?: string | null
  customerFingerprint?: string | null
  discountCode?: string | null
  conditions?: Record<string, unknown>
  ttlMs?: number
}

export interface PublicQuote {
  id: string
  token: string
  status: QuoteStatus
  shopifyProductId: string
  variantId: string | null
  quantity: number
  originalPrice: number
  finalPrice: number
  discountPercent: number
  currency: string
  discountCode: string | null
  expiresAt: string
}

/** Strip everything internal (floor, buyer handles) before a client sees a quote. */
export function toPublicQuote(quote: {
  id: string
  token: string
  status: string
  shopifyProductId: string
  variantId: string | null
  quantity: number
  originalPrice: number
  finalPrice: number
  discountPercent: number
  currency: string
  discountCode: string | null
  expiresAt: Date
}): PublicQuote {
  return {
    id: quote.id,
    token: quote.token,
    status: isQuoteStatus(quote.status) ? quote.status : 'CREATED',
    shopifyProductId: quote.shopifyProductId,
    variantId: quote.variantId,
    quantity: quote.quantity,
    originalPrice: quote.originalPrice,
    finalPrice: quote.finalPrice,
    discountPercent: exactPercentOff(quote.originalPrice, quote.finalPrice),
    currency: quote.currency,
    discountCode: quote.discountCode,
    expiresAt: quote.expiresAt.toISOString(),
  }
}

/**
 * Create a quote. Returns null when the feature is off or no signing secret is
 * configured — callers treat a null quote as "quote layer unavailable" and
 * continue with the legacy path. Never throws for the common disabled case.
 */
export async function createQuote(input: CreateQuoteInput) {
  if (!isFeatureEnabled('BARGAIN_QUOTE')) return null
  const id = crypto.randomUUID()
  const token = signQuoteToken(id)
  if (!token) return null
  const ttl = input.ttlMs ?? QUOTE_TTL_MS
  try {
    const quote = await prisma.$transaction(async (tx) => {
      const created = await tx.bargainQuote.create({
        data: {
          id,
          storeId: input.storeId,
          sessionId: input.sessionId ?? null,
          cartToken: input.cartToken ?? null,
          shopifyProductId: input.shopifyProductId,
          variantId: input.variantId ?? null,
          quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
          originalPrice: input.originalPrice,
          finalPrice: input.finalPrice,
          discountPercent: Math.round(input.discountPercent),
          floorPrice: input.floorPrice,
          currency: input.currency ?? 'INR',
          customerEmail: input.customerEmail ?? null,
          shopifyCustomerId: input.shopifyCustomerId ?? null,
          customerFingerprint: input.customerFingerprint ?? null,
          token,
          status: 'CREATED',
          conditions: (input.conditions ?? {}) as any,
          discountCode: input.discountCode ?? null,
          expiresAt: new Date(Date.now() + ttl),
        },
      })
      await tx.bargainQuoteEvent.create({
        data: { quoteId: id, storeId: input.storeId, type: 'created', toStatus: 'CREATED' },
      })
      return created
    })
    return quote
  } catch (err) {
    console.error('[BARGAIN_QUOTE_CREATE]', (err as Error)?.message ?? err)
    return null
  }
}

/**
 * Load a quote by its signed token. Rejects a token whose signature does not
 * bind to the stored row (forgery), and lazily marks a past-window quote
 * EXPIRED so callers always see a truthful status.
 */
export async function loadQuoteByToken(token: string) {
  if (!token) return null
  const quote = await prisma.bargainQuote.findUnique({ where: { token } })
  if (!quote) return null
  if (!verifyQuoteToken(quote.id, token)) return null
  if (isExpired(quote)) {
    await transitionQuote({ quoteId: quote.id, to: 'EXPIRED', detail: { reason: 'ttl' }, storeId: quote.storeId })
    return (await prisma.bargainQuote.findUnique({ where: { id: quote.id } })) ?? quote
  }
  return quote
}

/** Most recent quote for a session (used to resurface the token on replay). */
export async function findQuoteBySessionId(sessionId: string) {
  if (!sessionId) return null
  return prisma.bargainQuote.findFirst({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  })
}

/** Quote carrying a given Shopify discount code (store-scoped). */
export async function findQuoteByDiscountCode(storeId: string, discountCode: string) {
  if (!storeId || !discountCode) return null
  return prisma.bargainQuote.findFirst({ where: { storeId, discountCode } })
}

export interface TransitionResult {
  id: string
  status: string
  storeId: string
}

/**
 * Atomic compare-and-swap along the state machine. `to` may only be reached
 * from its declared source states; the `where` clause encodes that, so two
 * concurrent callers can never both win. Returns null on an illegal/stale
 * transition (the caller maps that to a 409).
 */
export async function transitionQuote(opts: {
  quoteId: string
  to: QuoteStatus
  detail?: Record<string, unknown>
  storeId?: string
  // When set, also require the row still carries this discount code (guards the
  // redeem path against a code swapped underneath us).
  requireDiscountCode?: string | null
}): Promise<TransitionResult | null> {
  const froms = REVERSE[opts.to]
  if (!froms || froms.length === 0) return null
  const now = new Date()
  const data: Record<string, unknown> = { status: opts.to }
  if (opts.to === 'ACCEPTED') data.acceptedAt = now
  if (opts.to === 'CHECKOUT_PENDING') data.checkoutStartedAt = now
  if (opts.to === 'REDEEMED') data.redeemedAt = now
  if (opts.to === 'REVOKED') data.revokedAt = now
  if (opts.to === 'REVOKED' && typeof opts.detail?.reason === 'string') data.revokeReason = opts.detail.reason

  const where: any = { id: opts.quoteId, status: { in: froms } }
  if (opts.requireDiscountCode !== undefined) where.discountCode = opts.requireDiscountCode

  try {
    // Resolve storeId for the audit row (the CAS is what guarantees correctness;
    // this read only labels the event).
    let storeId = opts.storeId
    if (!storeId) {
      const row = await prisma.bargainQuote.findUnique({ where: { id: opts.quoteId }, select: { storeId: true } })
      storeId = row?.storeId
    }
    return await prisma.$transaction(async (tx) => {
      const res = await tx.bargainQuote.updateMany({ where, data })
      if (res.count === 0) return null
      await tx.bargainQuoteEvent.create({
        data: {
          quoteId: opts.quoteId,
          storeId: storeId ?? '',
          type: opts.to.toLowerCase(),
          toStatus: opts.to,
          detail: (opts.detail ?? {}) as any,
        },
      })
      return { id: opts.quoteId, status: opts.to, storeId: storeId ?? '' }
    })
  } catch (err) {
    console.error('[BARGAIN_QUOTE_TRANSITION]', (err as Error)?.message ?? err)
    return null
  }
}

/** Convenience: CREATED → ACCEPTED (idempotent when already ACCEPTED). */
export async function acceptQuote(quote: { id: string; status: string }) {
  if (quote.status === 'ACCEPTED') return { id: quote.id, status: 'ACCEPTED' as const }
  return transitionQuote({ quoteId: quote.id, to: 'ACCEPTED' })
}

/** ACCEPTED → CHECKOUT_PENDING (idempotent when already pending). */
export async function markQuoteCheckoutPending(quote: { id: string; status: string }) {
  if (quote.status === 'CHECKOUT_PENDING') return { id: quote.id, status: 'CHECKOUT_PENDING' as const }
  if (quote.status === 'CREATED') {
    const accepted = await acceptQuote(quote)
    if (!accepted) return null
  }
  return transitionQuote({ quoteId: quote.id, to: 'CHECKOUT_PENDING' })
}

/**
 * Single-use redemption. Only one caller wins; a repeat with the SAME order id
 * is an idempotent success, any other repeat is a conflict.
 */
export async function redeemQuote(opts: {
  quote: { id: string; status: string; orderId?: string | null; storeId?: string }
  orderId: string
}): Promise<{ ok: true; alreadyRedeemed?: boolean } | { ok: false; reason: 'CONFLICT' | 'EXPIRED' | 'REVOKED' }> {
  if (opts.quote.status === 'REDEEMED') {
    return opts.quote.orderId && opts.quote.orderId === opts.orderId
      ? { ok: true, alreadyRedeemed: true }
      : { ok: false, reason: 'CONFLICT' }
  }
  if (opts.quote.status === 'EXPIRED') return { ok: false, reason: 'EXPIRED' }
  if (opts.quote.status === 'REVOKED' || opts.quote.status === 'INVALIDATED' || opts.quote.status === 'CANCELLED') {
    return { ok: false, reason: 'REVOKED' }
  }
  try {
    const won = await prisma.$transaction(async (tx) => {
      const res = await tx.bargainQuote.updateMany({
        where: { id: opts.quote.id, status: { in: ['ACCEPTED', 'CHECKOUT_PENDING'] } },
        data: { status: 'REDEEMED', redeemedAt: new Date(), orderId: opts.orderId },
      })
      if (res.count === 0) return false
      await tx.bargainQuoteEvent.create({
        data: { quoteId: opts.quote.id, storeId: opts.quote.storeId ?? '', type: 'redeemed', toStatus: 'REDEEMED', detail: { orderId: opts.orderId } as any },
      })
      return true
    })
    return won ? { ok: true } : { ok: false, reason: 'CONFLICT' }
  } catch (err) {
    console.error('[BARGAIN_QUOTE_REDEEM]', (err as Error)?.message ?? err)
    return { ok: false, reason: 'CONFLICT' }
  }
}

/** Merchant/policy revocation — valid from any non-terminal state. */
export async function revokeQuote(quoteId: string, reason: string) {
  return transitionQuote({ quoteId, to: 'REVOKED', detail: { reason } })
}

/** Invalidate — e.g. the product price changed so the locked price is stale. */
export async function invalidateQuote(quoteId: string, reason: string) {
  return transitionQuote({ quoteId, to: 'INVALIDATED', detail: { reason } })
}
