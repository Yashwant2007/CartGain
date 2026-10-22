/**
 * Recovery links — the ONLY places a cart-recovery message may send someone.
 *
 * Every link goes through our own `/r/<cartId>` redirect first so the click is
 * recorded before the shopper lands on the store (attribution), then the
 * redirect decides where "the sale" actually continues:
 *
 *   cart     → our branded recovery page (cart + checkout + bargain widget)
 *   bargain  → the same page with the negotiation panel open
 *   checkout → the store's own cart/checkout with the code pre-applied
 *
 * Keeping the builders here means the job, the email template and the WhatsApp
 * template can never drift apart (a link that "works" in one channel but 404s
 * in another was a real bug class).
 */

export type RecoveryLinkKind = 'cart' | 'bargain' | 'checkout'

const CODE_RE = /^[A-Za-z0-9_-]{3,40}$/

export function isSafeDiscountCode(code: unknown): code is string {
  return typeof code === 'string' && CODE_RE.test(code)
}

/** The public origin our redirect links live on. */
export function recoveryAppBase(appUrl?: string | null): string {
  const raw = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim()
  return raw.replace(/\/$/, '')
}

/**
 * A tracked recovery link.
 *
 * `https://cart-gain.com/r/<cartId>?c=whatsapp&to=bargain`
 */
export function buildRecoveryLink(opts: {
  appUrl?: string | null
  cartId: string
  channel: 'email' | 'whatsapp'
  kind?: RecoveryLinkKind
  /** Applied at the store checkout; only used by `kind: 'checkout'`. */
  discountCode?: string | null
}): string {
  const base = recoveryAppBase(opts.appUrl)
  const params = new URLSearchParams()
  params.set('c', opts.channel)
  if (opts.kind && opts.kind !== 'cart') params.set('to', opts.kind)
  if (opts.kind === 'checkout' && isSafeDiscountCode(opts.discountCode)) {
    params.set('code', opts.discountCode)
  }
  return `${base}/r/${encodeURIComponent(opts.cartId)}?${params.toString()}`
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * The store's own checkout, with the discount already applied when we have a
 * code. Shopify's shareable `/discount/<code>?redirect=<path>` link sets the
 * discount cookie and then forwards to the cart (which restores the abandoned
 * items from its permanent cart token).
 */
export function buildStoreCheckoutLink(opts: {
  domain: string
  shopifyCartId?: string | null
  discountCode?: string | null
}): string {
  const domain = normalizeDomain(opts.domain)
  const cartToken = (opts.shopifyCartId || '').trim()
  const cartPath = cartToken ? `/cart/${encodeURIComponent(cartToken)}` : ''
  if (isSafeDiscountCode(opts.discountCode)) {
    const redirect = cartPath ? `?redirect=${encodeURIComponent(cartPath)}` : ''
    return `https://${domain}/discount/${encodeURIComponent(opts.discountCode)}${redirect}`
  }
  return cartPath ? `https://${domain}${cartPath}` : `https://${domain}`
}
