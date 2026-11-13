// ── Bundle / multi-item negotiation (Module 6) ──────────────
// The single-product engine (bulk = same SKU) stays authoritative. This module
// adds a DETERMINISTIC, floor-safe bundle price for a set of DISTINCT products:
// the model never invents a combined number — the server computes one from the
// items' live prices and their per-product floors. A uniform bundle percentage
// is chosen so that EVERY item stays at or above its own floor, which is the
// only safe way to express a multi-product discount as one Shopify code.

export interface BundleItem {
  productId: string
  variantId?: string | null
  title: string
  price: number
  floor: number
  quantity: number
}

export interface BundleQuote {
  items: BundleItem[]
  listTotal: number
  floorTotal: number
  offerTotal: number
  discountPercent: number
}

export const MAX_BUNDLE_ITEMS = 5

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The largest uniform % off that keeps EVERY item at/above its own floor.
 * A per-item floor can only ever bind the bundle downward, never upward.
 */
export function floorSafeDiscountPercent(items: BundleItem[], desiredPercent: number): number {
  let maxPct = 100
  for (const it of items) {
    if (it.price > 0 && it.floor > 0) {
      maxPct = Math.min(maxPct, (1 - it.floor / it.price) * 100)
    }
  }
  const desired = Number.isFinite(desiredPercent) ? desiredPercent : 0
  return round2(Math.max(0, Math.min(desired, maxPct)))
}

/**
 * Build a floor-safe bundle quote. Returns null when this is not a real bundle
 * (fewer than two distinct items, or no positive value).
 */
export function buildBundle(items: BundleItem[], opts: { discountPercent: number }): BundleQuote | null {
  const clean = items
    .filter((it) => it && it.productId && Number.isFinite(it.price) && it.price > 0 && (it.quantity ?? 1) >= 1)
    .slice(0, MAX_BUNDLE_ITEMS)
    .map((it) => ({ ...it, quantity: Math.max(1, Math.floor(it.quantity)), floor: Math.max(0, Math.min(it.floor, it.price)) }))

  // Distinct products only.
  const seen = new Set<string>()
  const distinct = clean.filter((it) => (seen.has(it.productId) ? false : (seen.add(it.productId), true)))
  if (distinct.length < 2) return null

  const listTotal = round2(distinct.reduce((s, it) => s + it.price * it.quantity, 0))
  const floorTotal = round2(distinct.reduce((s, it) => s + it.floor * it.quantity, 0))
  if (listTotal <= 0) return null

  const discountPercent = floorSafeDiscountPercent(distinct, opts.discountPercent)
  const offerTotal = round2(Math.max(floorTotal, listTotal * (1 - discountPercent / 100)))

  return { items: distinct, listTotal, floorTotal, offerTotal, discountPercent }
}

export interface BundleValidation {
  ok: boolean
  reason?: 'not_a_bundle' | 'below_floor' | 'above_list' | 'invalid'
}

/** Final gate before minting a bundle code: the offer must sit in [floor, list]. */
export function validateBundleOffer(quote: BundleQuote): BundleValidation {
  if (!quote || quote.items.length < 2) return { ok: false, reason: 'not_a_bundle' }
  if (!Number.isFinite(quote.offerTotal) || quote.offerTotal <= 0) return { ok: false, reason: 'invalid' }
  if (quote.offerTotal < quote.floorTotal - 0.01) return { ok: false, reason: 'below_floor' }
  if (quote.offerTotal > quote.listTotal + 0.01) return { ok: false, reason: 'above_list' }
  return { ok: true }
}

export interface AllocatedItem {
  productId: string
  variantId?: string | null
  title: string
  quantity: number
  listPrice: number
  offerPrice: number
}

/**
 * Split the bundle total across items proportionally to list value, clamped to
 * each item's floor, then reconcile the remainder so the parts sum exactly to
 * the offer total. Used for display and for the per-item audit trail.
 */
export function allocateDiscount(items: BundleItem[], offerTotal: number): AllocatedItem[] {
  const listTotal = items.reduce((s, it) => s + it.price * it.quantity, 0)
  if (listTotal <= 0) return []

  const target = Math.max(items.reduce((s, it) => s + it.floor * it.quantity, 0), Math.min(offerTotal, listTotal))

  // 1) proportional share
  let allocated = items.map((it) => {
    const share = (it.price * it.quantity) / listTotal
    const raw = target * share
    const min = it.floor * it.quantity
    const max = it.price * it.quantity
    return Math.min(max, Math.max(min, raw))
  })

  // 2) reconcile rounding drift within [floor, list] room
  let drift = round2(target - allocated.reduce((s, v) => s + v, 0))
  const room = items.map((it) => {
    const min = it.floor * it.quantity
    const max = it.price * it.quantity
    return { min, max }
  })
  let guard = 0
  while (Math.abs(drift) >= 0.01 && guard++ < 50) {
    const step = drift > 0 ? 0.01 : -0.01
    let moved = false
    for (let i = 0; i < allocated.length; i++) {
      if (drift > 0 && allocated[i] + 0.01 <= room[i].max + 0.001) {
        allocated[i] = round2(allocated[i] + 0.01)
        drift = round2(drift - 0.01)
        moved = true
      } else if (drift < 0 && allocated[i] - 0.01 >= room[i].min - 0.001) {
        allocated[i] = round2(allocated[i] - 0.01)
        drift = round2(drift + 0.01)
        moved = true
      }
      if (Math.abs(drift) < 0.01) break
    }
    if (!moved) break
  }

  return items.map((it, i) => ({
    productId: it.productId,
    variantId: it.variantId ?? null,
    title: it.title,
    quantity: it.quantity,
    listPrice: round2(it.price * it.quantity),
    offerPrice: round2(allocated[i]),
  }))
}

/** A short, honest sentence describing the bundle (for the AI reply / widget). */
export function bundleSummary(items: BundleItem[], currencySymbol: string): string {
  const names = items.map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.title}` : it.title))
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  if (names.length > 2) return `${names.slice(0, -1).join(', ')} + ${names[names.length - 1]}`
  return names[0] ?? `${currencySymbol}0`
}
