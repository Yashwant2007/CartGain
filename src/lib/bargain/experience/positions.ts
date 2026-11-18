// ─────────────────────────────────────────────────────────────────────────────
// LIVING SHOPKEEPER — contextual position manager (pure, deterministic)
// ─────────────────────────────────────────────────────────────────────────────
//
// The character behaves like a salesperson walking with the shopper. Where it
// stands is decided by ONE explicit manager instead of scattered CSS.
//
// Rules:
//   * The character never covers the product, the price, the cart or checkout.
//   * Every position is a layout SLOT inside the widget, never an arbitrary
//     absolute coordinate over the merchant's theme.
//   * On narrow viewports every slot collapses to a compact, non-blocking
//     placement (see the widget's `cg-living` stylesheet).
//

export const AVATAR_POSITIONS = [
  'product_intro',
  'conversation',
  'recommendation',
  'product_explanation',
  'celebration',
  'checkout',
] as const

export type AvatarPosition = (typeof AVATAR_POSITIONS)[number]

export function isAvatarPosition(value: unknown): value is AvatarPosition {
  return typeof value === 'string' && (AVATAR_POSITIONS as readonly string[]).includes(value)
}

export interface PositionContext {
  /** The shopper's latest message (used to tell a question from a bid). */
  customerMessage?: string | null
  /** Engine decision for the turn. */
  decision?: string | null
  /** Terminal status for the session, when the turn ended it. */
  ended?: string | null
  /** True when verified product cards are on screen. */
  hasRecommendations?: boolean
  /** True once the shopper opened checkout. */
  checkoutStarted?: boolean
  /** True when the conversation is still in its opening beat. */
  opening?: boolean
}

/**
 * The single source of truth for "where does the character stand".
 *
 * Precedence is intentional and stable:
 *   checkout > celebration > recommendation > explanation > intro > conversation.
 */
export function positionForContext(ctx: PositionContext = {}): AvatarPosition {
  const decision = (ctx.decision ?? '').toLowerCase()
  const ended = (ctx.ended ?? '').toLowerCase()

  if (ctx.checkoutStarted) return 'checkout'
  if (ended === 'accepted' || decision === 'accept') return 'celebration'
  if (ctx.hasRecommendations) return 'recommendation'

  const text = (ctx.customerMessage ?? '').trim().toLowerCase()
  if (text && asksAboutProduct(text)) return 'product_explanation'

  if (ctx.opening) return 'product_intro'
  return 'conversation'
}

const PRODUCT_QUESTION_RE = /\b(material|made\s+of|ingredient|composition|sizes?|colour|color|warrant(y|ies)|guarantee|feature(s)?|specs?\b|specification|compatible|certif|measurement|dimensions?|weight|battery|usb|cotton|leather|capacity|speed|does\s+it\s+have|do\s+you\s+have|how\s+many|comes\s+with|included|shipping|deliver(y)?|arrive|quality|durable|durability|authentic|original|genuine|reviews?)\b/i

/** True when the shopper is asking about the product rather than bidding. */
export function asksAboutProduct(message: string): boolean {
  const text = message.trim()
  if (!text) return false
  return PRODUCT_QUESTION_RE.test(text)
}

export interface PositionDescriptor {
  /** Stable class name used by the widget stylesheet. */
  className: string
  /** Accessible description of where the character is standing. */
  label: string
}

export const POSITION_DESCRIPTORS: Record<AvatarPosition, PositionDescriptor> = {
  product_intro: { className: 'cg-living--intro', label: 'Introducing the product' },
  conversation: { className: 'cg-living--conversation', label: 'In the conversation' },
  recommendation: { className: 'cg-living--recommendation', label: 'Beside the recommendations' },
  product_explanation: { className: 'cg-living--explanation', label: 'Explaining the product' },
  celebration: { className: 'cg-living--celebration', label: 'Celebrating the deal' },
  checkout: { className: 'cg-living--checkout', label: 'Guiding to checkout' },
}
