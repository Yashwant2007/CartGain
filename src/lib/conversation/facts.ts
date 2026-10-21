/**
 * Conversation facts — the TRUSTED context of a single customer interaction.
 *
 * Everything the model is allowed to assert must be derivable from this
 * object. Facts we do not have (bestseller status, stock level, review count,
 * competitor prices) are simply absent, and `validate.ts` blocks any message
 * that claims them. That is the difference between persuasive copy and
 * deceptive copy.
 *
 * The object is intentionally small: it carries the cart, the offer and the
 * channel, not the customer's whole history.
 */

export type ConversationItem = {
  name: string
  price: number
  quantity: number
  description?: string
}

export type ConversationDiscount = {
  code: string
  /** Percentage (0-100) or fixed amount, depending on `type`. */
  value: number
  type: 'percentage' | 'fixed' | 'free_shipping'
}

export type ConversationFacts = {
  storeName: string
  currencySymbol: string
  items: ConversationItem[]
  total: number
  cartUrl: string
  customerName?: string
  /** The offer the merchant actually authorised, if any. */
  discount?: ConversationDiscount | null
  /** Verified, first-party signals. Empty means "we know nothing". */
  verified?: {
    /** Real sales/review data proving this product is a bestseller. */
    bestseller?: boolean
    /** Real inventory data proving low stock. */
    lowStock?: boolean
    /** Real review count. */
    reviewCount?: number
  }
  /** Which step of the recovery sequence this message is. */
  stage?: number
  /** Which channel the message goes to. */
  channel: 'email' | 'whatsapp'
}

function normalizeAmount(value: number): number {
  return Math.round(value * 100) / 100
}

/** Every monetary amount the copy is allowed to mention. */
export function allowedAmounts(facts: ConversationFacts): number[] {
  const amounts = new Set<number>()
  const add = (value: number) => {
    if (!Number.isFinite(value)) return
    amounts.add(normalizeAmount(value))
  }
  add(facts.total)
  for (const item of facts.items) {
    add(item.price)
    add(item.price * item.quantity)
  }
  if (facts.discount) add(facts.discount.value)
  if (facts.verified?.reviewCount) add(facts.verified.reviewCount)
  return Array.from(amounts)
}

/** Every code the copy is allowed to mention. */
export function allowedCodes(facts: ConversationFacts): string[] {
  return facts.discount?.code ? [facts.discount.code] : []
}

/** Hosts the copy is allowed to link to. */
export function allowedHosts(facts: ConversationFacts): string[] {
  const hosts: string[] = []
  for (const url of [facts.cartUrl]) {
    if (!url) continue
    try {
      hosts.push(new URL(url).host.toLowerCase())
    } catch {
      // ignore unparsable urls
    }
  }
  return hosts
}
