/**
 * Typed contract for the CartGain Bargain storefront API + the cg_* postMessage
 * protocol shared between the theme controller (extensions/storefront-bargain)
 * and the iframed widget (src/app/bargain/embed).
 *
 * The server is ALWAYS authoritative: these types describe what the widget may
 * *consume*. Response shapes are server-sourced; the widget never constructs a
 * price claim of its own (floor/manufacturing values stay server-side).
 */

// ── postMessage protocol (theme ⇄ iframe) ────────────────────────────────
export type CgParentMessage =
  | { type: 'cg_get_height'; height?: never }
  | { type: 'cg_close'; height?: never }
  | {
      type: 'cg_product_update'
      variantId?: string | null
      price?: number
      image?: string | null
      title?: string | null
      height?: never
    }

export type CgEmbedMessage =
  | { type: 'cg_resize'; height: number }
  | { type: 'cg_empty'; height?: never }
  /** Drawer mode: posted once the widget has mounted, so the theme controller can
   *  swap its boot skeleton for the real chat. */
  | { type: 'cg_hello'; height?: never }
  /** Drawer mode: the widget's close button asks the theme controller to close. */
  | { type: 'cg_close'; height?: never }

// ── Bargain messages / sessions ──────────────────────────────────────────
export type BargainMessageRole = 'customer' | 'ai' | 'system'

export type BargainMessage = {
  id: string
  role: BargainMessageRole
  content: string
  offeredPrice?: number | null
  createdAt?: string
  // Client-only delivery annotation for the shopper's own bubble (never sent by
  // the server). 'sending' shows a clock; 'delivered' shows a single tick.
  delivery?: 'sending' | 'delivered'
}

/** Server-sourced presentation of a session. Never contains floor data. */
export type PublicBargainSession = {
  id: string
  shopifyProductId: string
  originalPrice: number
  currentOffer: number | null
  finalPrice: number | null
  status: string
  /** Issued when a negotiation ended without an accept — the last price we
   *  offered, usable at checkout. */
  discountCode?: string | null
  /** Link that applies the issued code and drops the shopper into checkout. */
  purchaseUrl?: string | null
  attemptsUsed: number
  language: string
  startedAt: string
  expiresAt: string
  messages: BargainMessage[]
}

export type BargainDecision = 'idle' | 'chat' | 'counter' | 'accept' | 'reject'

/** A rejection the backend reports on accept — message is server-authored copy. */
export type BargainRejection = {
  code: string
  reason: string
  message: string
}

export type PlanLimit =
  | { code: string; planId?: string; upgradeUrl?: string }

// ── Start ────────────────────────────────────────────────────────────────
export type BargainStartBody = {
  storeId: string
  shopifyProductId: string
  variantId?: string | null
  originalPrice: number
  currency: string
  cartToken?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  customerFingerprint?: string | null
  language?: string | null
}

// ── Daily sales goal (customer-safe projection) ─────────────────────────────
/** The store's daily sales target while its window is active, so the widget
 *  can render a truthful "Today's goal" strip. Carries ONLY customer-safe
 *  fields: the real target/progress, the real close time (for honest urgency)
 *  and the merchant's own campaign copy. The internal strategy, pacing mode
 *  and every floor/margin/attempt number stay server-side — the server
 *  builds this shape via goals.publicGoalView(). */
export type BargainGoalView = {
  goalType: 'orders' | 'revenue'
  targetValue: number
  achievedValue: number
  orderCount: number
  /** 0–100: orders/target for an orders goal, value/target for revenue. */
  progressPercent: number
  /** ISO instant the real goal window closes (truthful urgency only). */
  closesAt?: string
  campaignName?: string
  campaignMessage?: string
}

/** Live-demo variant: the merchant preview may also show the internal pacing
 *  chip (strategy/mode) that is driving the agent RIGHT NOW. Never sent to a
 *  customer — /api/bargain/demo is merchant-session gated. */
export type BargainDemoGoal = BargainGoalView & {
  strategy?: 'CONSERVATIVE' | 'NORMAL' | 'AGGRESSIVE' | 'CLOSING'
  mode?: 'ahead' | 'on_track' | 'behind' | 'idle'
}

export type BargainStartSuccess = {
  sessionId: string
  /** Signed token bound to the session. Proof-of-origin the widget echoes on
   *  every follow-up call so a leaked sessionId alone can't drive the session. */
  sessionToken?: string
  session?: PublicBargainSession
  openingMessage: string
  expiresAt: string
  returning?: boolean
  existingSession?: boolean
  /** Active daily-goal view, when the store runs one. */
  goal?: BargainGoalView
}

// ── Offer ────────────────────────────────────────────────────────────────
export type BargainOfferBody = {
  sessionId: string
  message: string
  customerFingerprint?: string | null
  cartToken?: string | null
  customerEmail?: string | null
  sessionToken?: string | null
}

export type BargainOfferSuccess = {
  reply: string
  decision: BargainDecision
  counterOffer?: number | null
  sessionStatus?: string
  sessionId?: string
  finalPrice?: number | null
  /** Boolean-only signal that the AI just presented its best (= last) price. */
  floorReached?: boolean
  /**
   * Rounds consumed so far, as persisted server-side. A COUNT for the round
   * meter — never a price, margin or floor. Reflects the post-transaction value
   * (an abuse turn that does not consume an attempt is reported as rolled back).
   */
  attemptsUsed?: number
  /** Active daily-goal view, refreshed alongside each turn (see BargainGoalView). */
  goal?: BargainGoalView
  recommendations?: BargainRecommendation[]
  recommendationReason?: string
  abuseDetected?: boolean
  abuseCategory?: string
  terminal?: boolean
  /** Retention deal minted when the negotiation ends WITHOUT an accept. */
  discountCode?: string | null
  purchaseUrl?: string | null
  claimUrl?: string | null
}

/** Terminal / non-OK offer responses the widget must handle gracefully. */
export type BargainOfferTerminal = {
  message?: string
  terminal?: boolean
  status?: 'accepted' | 'rejected' | 'expired' | 'abandoned'
}

// ── Accept ───────────────────────────────────────────────────────────────
export type BargainAcceptBody = {
  sessionId: string
  customerFingerprint?: string | null
  cartToken?: string | null
  customerEmail?: string | null
  sessionToken?: string | null
}

export type BargainAcceptSuccess = {
  sessionId: string
  finalPrice: number
  discountPercent: number
  discountCode: string
  shopifyStatus: 'created' | 'pending' | 'failed'
  /** Link that applies the code and drops the shopper straight into checkout. */
  purchaseUrl?: string | null
  currency: string
  expiresAt: string
  message: string
}

// ── Recommendations (server-built, sanitized) ────────────────────────────
export type BargainRecommendation = {
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
  budgetFit: 'under' | 'over' | 'unknown'
  tags: string[]
}