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
}

/** Server-sourced presentation of a session. Never contains floor data. */
export type PublicBargainSession = {
  id: string
  shopifyProductId: string
  originalPrice: number
  currentOffer: number | null
  finalPrice: number | null
  status: string
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

export type BargainStartSuccess = {
  sessionId: string
  session?: PublicBargainSession
  openingMessage: string
  expiresAt: string
  returning?: boolean
  existingSession?: boolean
}

// ── Offer ────────────────────────────────────────────────────────────────
export type BargainOfferBody = {
  sessionId: string
  message: string
  customerFingerprint?: string | null
  cartToken?: string | null
  customerEmail?: string | null
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
  recommendations?: BargainRecommendation[]
  recommendationReason?: string
  abuseDetected?: boolean
  abuseCategory?: string
  terminal?: boolean
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
}

export type BargainAcceptSuccess = {
  sessionId: string
  finalPrice: number
  discountPercent: number
  discountCode: string
  shopifyStatus: 'created' | 'pending' | 'failed'
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