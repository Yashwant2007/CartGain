import {
  classifyShopperIntentCategory,
  hasExplicitRecommendationAsk,
  hasRecommendationStopRequest,
  type IntentAnalysis,
  type ShopperObjection,
} from './intent'

// AI Salesperson  -  deterministic product recommendation engine.
//
// When the shopper's budget, fit, or intent makes the current product a losing
// conversation, the engine surfaces REAL, verified alternatives from the store's
// own Shopify catalog. Everything here is deterministic and datasource-bound  - 
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
  rawProductUrl?: string | null
  available: boolean
  onSale: boolean
  budgetFit: BudgetFit
  productType?: string | null
  vendor?: string | null
  variantOptions?: string[]
  tags: string[]
  /** Short, honest "why this suits you" rationale  -  verified facts only. */
  reason: string
}

export type RecommendationReason = 'requested' | 'budget' | 'lowball' | 'discovery' | 'complementary'

export interface RecommendationContext {
  budget: number | null
  need: string | null
  reason: RecommendationReason
}

export type RecommendationDecision =
  | 'DO_NOT_RECOMMEND'
  | 'NEGOTIATE_CURRENT_PRODUCT'
  | 'ASK_CLARIFYING_QUESTION'
  | 'RECOMMEND_ALTERNATIVES'
  | 'SHOW_COMPLEMENTARY_PRODUCT'
  | 'RESUME_NEGOTIATION'
  | 'PROCEED_TO_CHECKOUT'

export interface RecommendationEligibilityInput {
  intent?: IntentAnalysis | null
  message?: string
  sessionStatus?: string | null
  engineDecision?: string | null
  history?: RecommendationHistory | null
  walkout?: boolean
  explicitAsk?: boolean
  acceptingDeal?: boolean
  purchased?: boolean
  budget?: number | null
  minPrice?: number | null
}

export interface RecommendationEligibility {
  decision: RecommendationDecision
  reason: string
  recommend: boolean
}

export function allowsRecommendations(decision: RecommendationDecision): boolean {
  return decision === 'RECOMMEND_ALTERNATIVES' || decision === 'SHOW_COMPLEMENTARY_PRODUCT'
}

export function decideRecommendation(input: RecommendationEligibilityInput): RecommendationEligibility {
  const decide = (decision: RecommendationDecision, reason: string): RecommendationEligibility => ({
    decision,
    reason,
    recommend: allowsRecommendations(decision),
  })
  const status = String(input.sessionStatus ?? '').toLowerCase()
  if (input.purchased === true || ['accepted', 'rejected', 'expired', 'abandoned', 'purchased', 'completed'].includes(status)) {
    return decide('DO_NOT_RECOMMEND', 'conversation is terminal or already purchased')
  }
  if (input.acceptingDeal === true || String(input.engineDecision ?? '').toLowerCase() === 'accept') {
    return decide('DO_NOT_RECOMMEND', 'deal already accepted')
  }

  const analysis = input.intent ?? null
  if (hasRecommendationStopRequest(input.message) || recommendationStoppedInHistory(input.history ?? null)) {
    return decide('DO_NOT_RECOMMEND', 'shopper asked to stop showing products')
  }
  const category = analysis
    ? classifyShopperIntentCategory(analysis, input.message)
    : null
  const explicit = input.explicitAsk === true || (analysis ? hasExplicitRecommendationAsk(analysis, input.message) : false)

  if (category?.code === 'H') return decide('PROCEED_TO_CHECKOUT', 'shopper is ready to buy')
  if (explicit) {
    return category?.code === 'K'
      ? decide('SHOW_COMPLEMENTARY_PRODUCT', 'shopper asked for a complementary product')
      : decide('RECOMMEND_ALTERNATIVES', 'shopper explicitly asked for other products')
  }
  if (category?.code === 'I') {
    return input.walkout || analysis?.intent === 'PURCHASE_HESITATION'
      ? decide('RESUME_NEGOTIATION', 'shopper is disengaging; resume the negotiation')
      : decide('DO_NOT_RECOMMEND', 'no clear ask to recommend')
  }
  if (category && ['C', 'D', 'E', 'G'].includes(category.code)) {
    return decide('ASK_CLARIFYING_QUESTION', 'product question needs a verified answer first')
  }
  if (category?.code === 'B') {
    const budget = input.budget ?? analysis?.budget ?? null
    const minPrice = input.minPrice ?? null
    return budget != null && minPrice != null && budget < minPrice
      ? decide('RECOMMEND_ALTERNATIVES', 'stated budget sits below the negotiated product price')
      : decide('NEGOTIATE_CURRENT_PRODUCT', 'negotiate the current product within the stated budget')
  }
  if (category?.code === 'A' || category?.code === 'F') {
    return decide('NEGOTIATE_CURRENT_PRODUCT', 'price objection is about the current product')
  }
  return decide('DO_NOT_RECOMMEND', 'no recommendation trigger')
}

export type RecommendationFeedbackAction = 'shown' | 'viewed' | 'clicked' | 'added' | 'dismissed' | 'rejected'

export interface RecommendationHistoryEntry {
  productId: string
  actions: RecommendationFeedbackAction[]
  firstShownAt: string | null
  lastActionAt: string | null
  reasons: string[]
}

export interface RecommendationHistory {
  entries: RecommendationHistoryEntry[]
  shownProductIds: string[]
  clickedProductIds: string[]
  addedProductIds: string[]
  dismissedProductIds: string[]
  rejectedProductIds: string[]
  lastShownProductIds: string[]
  lastShownAt: string | null
  stoppedAt: string | null
}

export interface RecommendationMessageLike {
  metadata?: unknown
  createdAt?: Date | string | null
}

const FEEDBACK_ACTIONS: readonly RecommendationFeedbackAction[] = ['shown', 'viewed', 'clicked', 'added', 'dismissed', 'rejected']

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string' || !value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export function normalizeProductId(value: unknown): string {
  const raw = String(value ?? '').trim()
  return raw.replace(/^gid:\/\/shopify\/Product\//, '').replace(/^gid:\/\/shopify\/ProductVariant\//, '')
}

function emptyHistory(): RecommendationHistory {
  return {
    entries: [],
    shownProductIds: [],
    clickedProductIds: [],
    addedProductIds: [],
    dismissedProductIds: [],
    rejectedProductIds: [],
    lastShownProductIds: [],
    lastShownAt: null,
    stoppedAt: null,
  }
}

function applyHistoryEvent(
  history: RecommendationHistory,
  action: RecommendationFeedbackAction,
  productId: string,
  at: string | null,
  reasons: string[],
): void {
  const id = normalizeProductId(productId)
  if (!id) return
  let entry = history.entries.find((candidate) => candidate.productId === id)
  if (!entry) {
    entry = { productId: id, actions: [], firstShownAt: null, lastActionAt: null, reasons: [] }
    history.entries.push(entry)
  }
  if (!entry.actions.includes(action)) entry.actions.push(action)
  if (action === 'shown' && !entry.firstShownAt) entry.firstShownAt = at ?? null
  if (!entry.lastActionAt || (at && at > entry.lastActionAt)) entry.lastActionAt = at ?? null
  for (const reason of reasons) {
    if (reason && !entry.reasons.includes(reason)) entry.reasons.push(reason)
  }
  if (action === 'shown') {
    if (!history.shownProductIds.includes(id)) history.shownProductIds.push(id)
    history.lastShownAt = at ?? null
  }
  if (action === 'viewed' && !history.shownProductIds.includes(id)) history.shownProductIds.push(id)
  if (action === 'clicked' && !history.clickedProductIds.includes(id)) history.clickedProductIds.push(id)
  if (action === 'added' && !history.addedProductIds.includes(id)) history.addedProductIds.push(id)
  if (action === 'dismissed' && !history.dismissedProductIds.includes(id)) history.dismissedProductIds.push(id)
  if (action === 'rejected' && !history.rejectedProductIds.includes(id)) history.rejectedProductIds.push(id)
}

export function readRecommendationHistory(messages: RecommendationMessageLike[]): RecommendationHistory {
  const history = emptyHistory()
  for (const message of messages ?? []) {
    const metadata = asRecord(message.metadata)
    if (!metadata) continue
    const fallbackAt = asIso(message.createdAt)
    if (metadata.recommendationStopped === true && !history.stoppedAt) {
      history.stoppedAt = asIso(metadata.recommendationStoppedAt) ?? fallbackAt
    }
    const shown = asRecord(metadata.recommendations)
    if (shown && Array.isArray(shown.productIds)) {
      const at = asIso(shown.at) ?? fallbackAt
      const reasons = [shown.reason, shown.decision].filter((r): r is string => typeof r === 'string' && r.length > 0)
      const ids = shown.productIds.map((id: unknown) => normalizeProductId(id)).filter(Boolean)
      for (const productId of ids) applyHistoryEvent(history, 'shown', productId, at, reasons)
      if (ids.length > 0) {
        history.lastShownProductIds = ids
        history.lastShownAt = at ?? null
      }
    }
    const event = asRecord(metadata.recommendationEvent)
    if (event && FEEDBACK_ACTIONS.includes(event.action) && event.productId != null) {
      applyHistoryEvent(
        history,
        event.action as RecommendationFeedbackAction,
        event.productId,
        asIso(event.at) ?? fallbackAt,
        typeof event.reason === 'string' && event.reason ? [event.reason] : [],
      )
    }
  }
  return history
}

export function recommendationShownMetadata(input: {
  productIds: string[]
  reason?: string | null
  decision?: RecommendationDecision | string | null
  at?: string | null
}): Record<string, unknown> {
  return {
    recommendations: {
      productIds: input.productIds.map(normalizeProductId).filter(Boolean),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.decision ? { decision: input.decision } : {}),
      at: input.at ?? new Date().toISOString(),
    },
  }
}

export function recommendationStoppedMetadata(at?: string | null): Record<string, unknown> {
  return {
    recommendationStopped: true,
    recommendationStoppedAt: at ?? new Date().toISOString(),
  }
}

export function recommendationStoppedInHistory(history: RecommendationHistory | null | undefined): boolean {
  return history?.stoppedAt != null
}

export function recommendationEventMetadata(input: {
  action: RecommendationFeedbackAction
  productId: string
  at?: string | null
  reason?: string | null
}): Record<string, unknown> {
  return {
    recommendationEvent: {
      action: input.action,
      productId: normalizeProductId(input.productId),
      at: input.at ?? new Date().toISOString(),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  }
}

export function withRecommendationShown(
  history: RecommendationHistory,
  input: { productIds: string[]; reason?: string | null; decision?: RecommendationDecision | string | null; at?: string | null },
): RecommendationHistory {
  const next: RecommendationHistory = {
    ...history,
    entries: history.entries.map((entry) => ({ ...entry, actions: [...entry.actions], reasons: [...entry.reasons] })),
    shownProductIds: [...history.shownProductIds],
    clickedProductIds: [...history.clickedProductIds],
    addedProductIds: [...history.addedProductIds],
    dismissedProductIds: [...history.dismissedProductIds],
    rejectedProductIds: [...history.rejectedProductIds],
    lastShownProductIds: [...history.lastShownProductIds],
    stoppedAt: history.stoppedAt,
  }
  const at = input.at ?? new Date().toISOString()
  const reasons = [input.reason, input.decision].filter((r): r is string => typeof r === 'string' && r.length > 0)
  const ids = input.productIds.map(normalizeProductId).filter(Boolean)
  for (const productId of ids) applyHistoryEvent(next, 'shown', productId, at, reasons)
  if (ids.length > 0) {
    next.lastShownProductIds = ids
    next.lastShownAt = at
  }
  return next
}

export function recommendationExcludedProductIds(history: RecommendationHistory): string[] {
  return Array.from(new Set([
    ...history.shownProductIds,
    ...history.dismissedProductIds,
    ...history.rejectedProductIds,
  ]))
}

export type RecommendationRequestOutcome = {
  cards: RecommendationCard[]
  reason: RecommendationReason | null
  truncated: boolean
}

interface RawVariant {
  id?: string | number
  title?: string | null
  option1?: string | null
  option2?: string | null
  option3?: string | null
  price?: string | number | null
  compare_at_price?: string | number | null
  available?: boolean
  inventory_quantity?: number | null
  inventory_policy?: string | null
}

export interface RecoCandidate {
  productId: string
  title: string
  handle: string | null
  productType: string | null
  vendor: string | null
  tags: string[]
  variantTitle: string | null
  options: string[]
  imageUrl: string | null
  productUrl: string | null
  variantId: string
  price: number
  compareAtPrice: number | null
  available: boolean
  onSale: boolean
}

function rawOptions(raw: any, variant: RawVariant): string[] {
  const values: string[] = []
  if (Array.isArray(raw?.options)) {
    for (const option of raw.options) {
      if (typeof option === 'string') values.push(option)
      else if (option && typeof option.value === 'string') values.push(option.value)
    }
  }
  for (const key of ['option1', 'option2', 'option3'] as const) {
    const value = (variant as any)?.[key]
    if (typeof value === 'string' && value) values.push(value)
  }
  if (typeof variant?.title === 'string' && variant.title && variant.title.toLowerCase() !== 'default') {
    values.push(variant.title)
  }
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

/** Normalize a raw Shopify REST product object into a recommendation candidate. */
export function normalizeRecoCandidate(raw: any): RecoCandidate | null {
  if (!raw) return null
  if (raw.status != null && (String(raw.status).toLowerCase() === 'draft' || String(raw.status).toLowerCase() === 'archived')) return null

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
  const rawUrl = typeof raw.productUrl === 'string' && raw.productUrl ? raw.productUrl : null

  return {
    productId: normalizeProductId(raw.id),
    title: String(raw.title ?? '').trim(),
    handle: raw.handle ?? null,
    productType: raw.product_type ? String(raw.product_type) : null,
    vendor: raw.vendor ? String(raw.vendor) : null,
    tags: String(raw.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    variantTitle: typeof pick.title === 'string' && pick.title.toLowerCase() !== 'default' ? pick.title : null,
    options: rawOptions(raw, pick),
    imageUrl: typeof img === 'string' && img ? img : null,
    productUrl: rawUrl,
    variantId: String(pick.id ?? ''),
    price,
    compareAtPrice: compare,
    available: pick.available !== false,
    onSale: compare != null,
  }
}

function needTokens(need: string | null | undefined): string[] {
  return (need ?? '').toLowerCase().trim().split(/[^a-z0-9]+/).filter(Boolean)
}

function candidateHaystack(c: RecoCandidate): string {
  return `${c.title} ${c.productType ?? ''} ${c.vendor ?? ''} ${c.tags.join(' ')} ${c.options.join(' ')}`.toLowerCase()
}

function overlapCount(tokens: string[], haystack: string): number {
  return tokens.filter((token) => token.length > 1 && haystack.includes(token)).length
}

interface RecoScoreOptions {
  budget?: number | null
  need?: string | null
  referencePrice?: number | null
  objection?: ShopperObjection | null
  similarProduct?: RecoCandidate | null
  history?: RecommendationHistory | null
  excludedProductIds?: Iterable<string> | null
  purchasedProductIds?: Iterable<string> | null
}

export function scoreRecoCandidate(c: RecoCandidate, opts: RecoScoreOptions): number {
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

  const tokens = needTokens(opts.need)
  if (tokens.length > 0) {
    const hits = overlapCount(tokens, candidateHaystack(c))
    if (hits > 0) score += 40 * hits + 5
  }

  const similar = opts.similarProduct
  if (similar && similar.productId !== c.productId) {
    if (similar.productType && c.productType && similar.productType.toLowerCase() === c.productType.toLowerCase()) score += 35
    if (similar.vendor && c.vendor && similar.vendor.toLowerCase() === c.vendor.toLowerCase()) score += 12
    const tagHits = c.tags.filter((tag) => similar.tags.some((other) => other.toLowerCase() === tag.toLowerCase())).length
    score += Math.min(tagHits, 3) * 12
    const optionHits = c.options.filter((option) => similar.options.some((other) => other.toLowerCase() === option.toLowerCase())).length
    score += Math.min(optionHits, 2) * 10
  }

  if (opts.objection === 'BUDGET' && budget != null && c.price <= budget) score += 25
  if (opts.objection === 'FIT_VARIANT' && tokens.length > 0 && overlapCount(tokens, `${c.options.join(' ')} ${c.title}`.toLowerCase()) > 0) score += 30
  if (opts.objection === 'AVAILABILITY' && c.available) score += 20

  const excludedIds = opts.excludedProductIds ? Array.from(opts.excludedProductIds) : []
  const purchasedIds = opts.purchasedProductIds ? Array.from(opts.purchasedProductIds) : []
  for (const excluded of excludedIds) {
    if (normalizeProductId(excluded) === c.productId) score -= 500
  }
  for (const purchased of purchasedIds) {
    if (normalizeProductId(purchased) === c.productId) score -= 500
  }
  const history = opts.history
  if (history) {
    if (history.dismissedProductIds.includes(c.productId) || history.rejectedProductIds.includes(c.productId)) score -= 500
    if (history.shownProductIds.includes(c.productId)) score -= 250
    if (history.clickedProductIds.includes(c.productId) || history.addedProductIds.includes(c.productId)) score -= 50
  }

  return score
}

/** A ranked, still-internal card  -  not yet sanitized for the customer wire. */
export interface RankedCard {
  productId: string
  variantId: string
  title: string
  price: number
  compareAtPrice?: number | null
  imageUrl: string | null
  productUrl: string | null
  available: boolean
  onSale: boolean
  tags: string[]
  budgetFit: BudgetFit
  handle: string | null
  productType: string | null
  vendor: string | null
  variantOptions: string[]
  reason: string
}

/**
 * A short, honest reason a card suits the shopper. Built ONLY from verified
 * catalogue facts (availability, sale status, price vs budget, title/type/tag
 * match against the shopper's stated need). Never invents benefits.
 */
export function recommendationReasonForCard(
  c: { title: string; productType: string | null; tags: string[]; price: number; compareAtPrice: number | null; onSale: boolean; available: boolean; budgetFit: BudgetFit },
  opts: { need?: string | null; referencePrice?: number | null } = {},
): string {
  if (c.budgetFit === 'under') return 'Fits the budget you shared'
  if (c.onSale) return 'On sale right now'
  const need = opts.need?.toLowerCase().trim()
  if (need) {
    const tokens = need.split(/[^a-z0-9]+/).filter(Boolean)
    const haystack = `${c.title} ${c.productType ?? ''} ${c.tags.join(' ')}`.toLowerCase()
    if (tokens.some((t) => haystack.includes(t))) return 'Matches what you were looking for'
  }
  if (opts.referencePrice != null && c.price < opts.referencePrice) return 'A more affordable option'
  if (c.compareAtPrice != null && c.compareAtPrice > c.price) return 'Discounted from the usual price'
  return 'Another option in this store'
}

/** Rank candidates and produce ranked cards (keeps the most relevant 5). */
export function rankRecommendations(
  candidates: RecoCandidate[],
  opts: {
    excludeProductId?: string | null
    budget?: number | null
    need?: string | null
    referencePrice?: number | null
    objection?: ShopperObjection | null
    similarProduct?: RecoCandidate | null
    history?: RecommendationHistory | null
    excludedProductIds?: Iterable<string> | null
    purchasedProductIds?: Iterable<string> | null
    limit?: number
  },
): { cards: RankedCard[]; truncated: boolean } {
  const limit = Math.min(opts.limit ?? 5, 8)
  const pool = candidates
    .filter((c) => c.productId !== normalizeProductId(opts.excludeProductId))
    .map((c) => ({
      c,
      score: scoreRecoCandidate(c, {
        budget: opts.budget,
        need: opts.need,
        referencePrice: opts.referencePrice,
        objection: opts.objection,
        similarProduct: opts.similarProduct,
        history: opts.history,
        excludedProductIds: opts.excludedProductIds,
        purchasedProductIds: opts.purchasedProductIds,
      }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
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
      productUrl: c.productUrl,
      available: c.available,
      onSale: c.onSale,
      tags: c.tags.slice(0, 6),
      budgetFit,
      handle: c.handle,
      productType: c.productType,
      vendor: c.vendor,
      variantOptions: c.options.slice(0, 6),
      reason: recommendationReasonForCard(
        { title: c.title, productType: c.productType, tags: c.tags, price: c.price, compareAtPrice: c.compareAtPrice, onSale: c.onSale, available: c.available, budgetFit },
        { need: opts.need ?? null, referencePrice: opts.referencePrice ?? null },
      ),
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

export interface SearchRecommendationsOptions {
  history?: RecommendationHistory
  strictBudget?: boolean
  objection?: ShopperObjection | null
  similarProductRaw?: any
  excludeProductIds?: string[]
  reason?: RecommendationReason | null
  limit?: number
}

type FetchProducts = (
  store: RecommendationRequest['store'],
  opts?: { limit?: number; pageInfo?: string | null; query?: string | null },
) => Promise<{ products: any[]; nextCursor: string | null; prevCursor: string | null; error: string | null }>

type ScoredCandidate = { c: RecoCandidate; score: number }

const DIVERSITY_SCORE_TOLERANCE = 20

function sameProductSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((id, index) => id === right[index])
}

function diversityFacet(c: RecoCandidate): string {
  return `${(c.productType ?? '').toLowerCase()}|${(c.vendor ?? '').toLowerCase()}|${(c.tags[0] ?? '').toLowerCase()}`
}

function diverseTop(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
  const picked: ScoredCandidate[] = []
  for (let slot = 0; slot < limit && picked.length < scored.length; slot++) {
    const remaining = scored.filter((entry) => !picked.includes(entry))
    if (remaining.length === 0) break
    let choice = remaining[0]
    if (picked.length > 0) {
      const anchor = diversityFacet(picked[0].c)
      const alternative = remaining.find(
        (entry) => diversityFacet(entry.c) !== anchor && entry.score >= choice.score - DIVERSITY_SCORE_TOLERANCE,
      )
      if (alternative) choice = alternative
    }
    picked.push(choice)
  }
  return picked
}

function pickFreshSet(scored: ScoredCandidate[], limit: number, lastShown: string[]): ScoredCandidate[] {
  if (scored.length === 0 || limit <= 0) return []
  for (let offset = 0; offset + Math.min(limit, scored.length) <= scored.length; offset++) {
    const picked = diverseTop(scored.slice(offset, offset + limit), limit)
    if (!sameProductSet(picked.map((entry) => entry.c.productId), lastShown)) return picked
  }
  return []
}

/**
 * Server-side search: pulls the store's real catalog, excludes the product the
 * shopper is currently bargaining, ranks by budget + need, and sanitizes every
 * card so merchant financial secrets never leak to the customer.
 */
export async function searchRecommendations(
  request: RecommendationRequest,
  fetchProducts: FetchProducts,
  referencePrice?: number | null,
  options?: SearchRecommendationsOptions,
): Promise<RecommendationRequestOutcome> {
  const history = options?.history ?? readRecommendationHistory([])
  const currentId = normalizeProductId(request.shopifyProductId)
  const excluded = new Set<string>([
    currentId,
    ...recommendationExcludedProductIds(history),
    ...(options?.excludeProductIds ?? []).map(normalizeProductId),
  ])
  const requestedNeedTokens = needTokens(request.need)
  const fetched = await fetchProducts(request.store, { limit: 250 })
  const similarProduct = options?.similarProductRaw ? normalizeRecoCandidate(options.similarProductRaw) : null
  const scored: ScoredCandidate[] = fetched.products
    .map(normalizeRecoCandidate)
    .filter((c): c is RecoCandidate => c != null && c.available && c.variantId.length > 0)
    .filter((c) => requestedNeedTokens.length === 0 || overlapCount(requestedNeedTokens, candidateHaystack(c)) > 0)
    .filter((c) => !excluded.has(c.productId))
    .filter((c) => !(options?.strictBudget && request.budget != null && c.price > request.budget))
    .map((c) => ({
      c,
      score: scoreRecoCandidate(c, {
        budget: request.budget ?? null,
        need: request.need ?? null,
        referencePrice: referencePrice ?? null,
        objection: options?.objection ?? null,
        similarProduct,
        history,
        excludedProductIds: excluded,
      }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.c.title.localeCompare(b.c.title)
    })

  const limit = Math.min(options?.limit ?? 2, 2)
  const picked = pickFreshSet(scored, limit, history.lastShownProductIds)
  const { cards } = rankRecommendations(picked.map((entry) => entry.c), {
    budget: request.budget ?? null,
    need: request.need ?? null,
    referencePrice: referencePrice ?? null,
    objection: options?.objection ?? null,
    history,
    excludedProductIds: excluded,
    limit,
  })

  return {
    cards: cards.map((c) => ({
      ...c,
      currency: request.currency,
      productUrl: c.productUrl ?? (c.handle
        ? `https://${request.store.domain}/products/${c.handle}?variant=${c.variantId}`
        : null),
    })),
    reason: options?.reason ?? (request.budget != null ? 'budget' : request.need != null ? 'discovery' : 'requested'),
    truncated: scored.length > picked.length,
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