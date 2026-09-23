// AI Salesperson — deterministic product recommendation engine.
//
// When the shopper's budget, fit, or intent makes the current product a losing
// conversation, the engine surfaces REAL, verified alternatives from the store's
// own Shopify catalog. Everything here is deterministic and datasource-bound —
// no LLM inventing product names, prices, or availability. The merchant's
// financial secrets (floor, margin, max discount) never appear on a card.

export type BudgetFit = 'under' | 'over' | 'unknown'

export interface RecommendationCard {
  productId: string
  variantId: string
  title: string
  price: number
  compareAtPrice?: number | null
  currency: string
  imageUrl: string | null
  productUrl: string | null
  available: boolean
  onSale: boolean
  budgetFit: BudgetFit
  tags: string[]
}

export type RecommendationReason = 'requested' | 'budget' | 'lowball' | 'discovery'

export interface RecommendationContext {
  budget: number | null
  need: string | null
  reason: RecommendationReason
}

export type RecommendationRequestOutcome = {
  cards: RecommendationCard[]
  reason: RecommendationReason | null
  truncated: boolean
}

interface RawVariant {
  id?: string | number
  price?: string | number | null
  compare_at_price?: string | number | null
  available?: boolean
  inventory_quantity?: number | null
  inventory_policy?: string | null
}

interface RecoCandidate {
  productId: string
  title: string
  handle: string | null
  productType: string | null
  tags: string[]
  imageUrl: string | null
  variantId: string
  price: number
  compareAtPrice: number | null
  available: boolean
  onSale: boolean
}

/** Normalize a raw Shopify REST product object into a recommendation candidate. */
export function normalizeRecoCandidate(raw: any): RecoCandidate | null {
  if (!raw) return null
  if (raw.status != null && (raw.status === 'draft' || raw.status === 'archived')) return null

  const variants: RawVariant[] = Array.isArray(raw.variants) ? raw.variants : []
  const pick =
    variants.find((v) => v?.available === true && v?.price != null) ??
    variants.find((v) => v?.available !== false && v?.price != null) ??
    variants[0]
  if (!pick) return null

  const price = parseFloat(String(pick.price))
  if (!Number.isFinite(price) || price <= 0) return null
  const compareRaw = pick.compare_at_price != null ? parseFloat(String(pick.compare_at_price)) : null
  const compare = compareRaw != null && Number.isFinite(compareRaw) && compareRaw > price ? compareRaw : null
  const img = raw.images?.[0]?.src ?? raw.image?.src ?? null

  return {
    productId: String(raw.id),
    title: String(raw.title ?? '').trim(),
    handle: raw.handle ?? null,
    productType: raw.product_type ?? null,
    tags: String(raw.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    imageUrl: typeof img === 'string' && img ? img : null,
    variantId: String(pick.id ?? ''),
    price,
    compareAtPrice: compare,
    available: pick.available !== false,
    onSale: compare != null,
  }
}

/** Deterministically score a candidate against budget + need (pure, testable). */
export function scoreRecoCandidate(c: RecoCandidate, opts: { budget?: number | null; need?: string | null; referencePrice?: number | null }): number {
  let score = 0
  if (c.available) score += 100

  const budget = opts.budget ?? null
  if (budget != null) {
    if (c.price <= budget) score += 140
    else if (c.price <= budget * 1.2) score += 40
  } else if (opts.referencePrice != null && c.price < opts.referencePrice) {
    score += 80
  }

  if (c.onSale) score += 30

  const need = opts.need?.toLowerCase().trim()
  if (need) {
    const needTokens = need.split(/[^a-z0-9]+/).filter(Boolean)
    const haystack = `${c.title} ${c.productType ?? ''} ${c.tags.join(' ')}`.toLowerCase()
    const hits = needTokens.filter((t) => haystack.includes(t)).length
    if (hits > 0) score += 40 * hits + 5
  }

  return score
}

/** A ranked, still-internal card — not yet sanitized for the customer wire. */
export interface RankedCard {
  productId: string
  variantId: string
  title: string
  price: number
  compareAtPrice?: number | null
  imageUrl: string | null
  available: boolean
  onSale: boolean
  tags: string[]
  budgetFit: BudgetFit
  handle: string | null
}

/** Rank candidates and produce ranked cards (keeps the most relevant 5). */
export function rankRecommendations(
  candidates: RecoCandidate[],
  opts: {
    excludeProductId?: string | null
    budget?: number | null
    need?: string | null
    referencePrice?: number | null
    limit?: number
  },
): { cards: RankedCard[]; truncated: boolean } {
  const limit = Math.min(opts.limit ?? 5, 8)
  const pool = candidates
    .filter((c) => c.productId !== opts.excludeProductId)
    .map((c) => ({ c, score: scoreRecoCandidate(c, opts) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // deterministic tiebreak so the same catalog always ranks the same way
      return a.c.title.localeCompare(b.c.title)
    })

  const sliced = pool.slice(0, limit).map(({ c }) => {
    const budgetFit: BudgetFit = opts.budget == null ? 'unknown' : c.price <= opts.budget ? 'under' : 'over'
    return {
      productId: c.productId,
      variantId: c.variantId,
      title: c.title,
      price: c.price,
      compareAtPrice: c.compareAtPrice,
      imageUrl: c.imageUrl,
      available: c.available,
      onSale: c.onSale,
      tags: c.tags.slice(0, 6),
      budgetFit,
      handle: c.handle,
    }
  })

  return { cards: sliced, truncated: pool.length > sliced.length }
}

export interface RecommendationRequest {
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null }
  shopifyProductId: string
  currency: string
  budget?: number | null
  need?: string | null
}

type FetchProducts = (
  store: RecommendationRequest['store'],
  opts?: { limit?: number; pageInfo?: string | null; query?: string | null },
) => Promise<{ products: any[]; nextCursor: string | null; prevCursor: string | null; error: string | null }>

/**
 * Server-side search: pulls the store's real catalog, excludes the product the
 * shopper is currently bargaining, ranks by budget + need, and sanitizes every
 * card so merchant financial secrets never leak to the customer.
 */
export async function searchRecommendations(
  request: RecommendationRequest,
  fetchProducts: FetchProducts,
  referencePrice?: number | null,
): Promise<RecommendationRequestOutcome> {
  const { cards, truncated } = rankRecommendations(
    (await fetchProducts(request.store, { limit: 250 })).products
      .map(normalizeRecoCandidate)
      .filter((c): c is RecoCandidate => c != null),
    {
      excludeProductId: request.shopifyProductId.replace(/^gid:\/\/shopify\/Product\//, ''),
      budget: request.budget ?? null,
      need: request.need ?? null,
      referencePrice: referencePrice ?? null,
    },
  )

  return {
    cards: cards.map((c) => ({
      ...c,
      currency: request.currency,
      productUrl: c.handle
        ? `https://${request.store.domain}/products/${c.handle}?variant=${c.variantId}`
        : null,
    })),
    reason: request.budget != null ? 'budget' : request.need != null ? 'discovery' : 'requested',
    truncated,
  }
}

/** Which recovery path triggered the recommendation layer this turn. */
export function recommendationReason(
  intent: string,
  aiRequested: boolean,
  budget: number | null,
  customerOffer: number | null,
  minPrice: number,
): RecommendationReason | null {
  if (intent === 'RECOMMENDATION_REQUEST' || aiRequested) return 'requested'
  if (intent === 'PRODUCT_DISCOVERY') return 'discovery'
  if (budget != null && budget < minPrice) return 'budget'
  if (customerOffer != null && customerOffer < minPrice * 0.45) return 'lowball'
  return null
}