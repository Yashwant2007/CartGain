// ── Shipping-aware negotiation (Module 4) ───────────────────
// Shopify's real shipping rules live in shipping zones/profiles and are not
// exposed to a third-party app through the Admin GraphQL API, so the merchant
// declares a simple, truthful model here: a flat shipping charge and an
// optional free-shipping order threshold. That is enough to (a) let the agent
// be transparent about the TOTAL cost (product + shipping) instead of quoting a
// bare price, and (b) turn the threshold into a real value-add — "a little more
// unlocks free shipping" — which protects margin far better than a deeper
// discount. Nothing here ever touches or reveals the hidden floor.

export interface ShippingConfig {
  enabled: boolean
  /** Flat shipping charge the merchant applies below the free threshold. */
  flatCost: number
  /** Order subtotal at/above which shipping is free; null = no free shipping. */
  freeThreshold: number | null
}

export interface ShippingInput {
  shippingAwareEnabled?: boolean | null
  shippingFlatCost?: number | null
  freeShippingThreshold?: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function positiveOrNull(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? round2(n) : null
}

/** Coerce stored columns into a clean, safe shipping config. */
export function normalizeShippingConfig(input: ShippingInput): ShippingConfig {
  const flatRaw = input.shippingFlatCost
  const flatCost = typeof flatRaw === 'number' && Number.isFinite(flatRaw) && flatRaw >= 0 ? round2(flatRaw) : 0
  return {
    enabled: input.shippingAwareEnabled === true,
    flatCost,
    freeThreshold: positiveOrNull(input.freeShippingThreshold),
  }
}

export interface ShippingQuote {
  /** Shipping charge for this basket (0 when free or shipping is off). */
  shippingCost: number
  freeShipping: boolean
  subtotal: number
  total: number
  /** How much more the shopper must spend to unlock free shipping (0 if N/A). */
  remainingForFreeShipping: number
  /** Whole units at this unit price that would unlock free shipping (≥1), or null. */
  unitsForFreeShipping: number | null
}

/** Deterministic shipping + total for a basket at a given (negotiated) unit price. */
export function computeShipping(opts: {
  config: ShippingConfig
  unitPrice: number
  quantity?: number
}): ShippingQuote {
  const qty = Math.max(1, Math.floor(opts.quantity ?? 1))
  const unit = Number.isFinite(opts.unitPrice) && opts.unitPrice > 0 ? opts.unitPrice : 0
  const subtotal = round2(unit * qty)
  const { config } = opts

  if (!config.enabled) {
    return {
      shippingCost: 0,
      freeShipping: false,
      subtotal,
      total: subtotal,
      remainingForFreeShipping: 0,
      unitsForFreeShipping: null,
    }
  }

  const meetsThreshold = config.freeThreshold != null && subtotal >= config.freeThreshold
  const shippingCost = meetsThreshold ? 0 : config.flatCost
  const remainingForFreeShipping =
    !meetsThreshold && config.freeThreshold != null ? round2(config.freeThreshold - subtotal) : 0

  let unitsForFreeShipping: number | null = null
  if (!meetsThreshold && config.freeThreshold != null && unit > 0) {
    unitsForFreeShipping = Math.max(1, Math.ceil((config.freeThreshold - subtotal) / unit))
  }

  return {
    shippingCost,
    freeShipping: meetsThreshold,
    subtotal,
    total: round2(subtotal + shippingCost),
    remainingForFreeShipping,
    unitsForFreeShipping,
  }
}

function formatMoney(value: number, symbol: string): string {
  const rounded = round2(value)
  return Number.isInteger(rounded) ? `${symbol}${rounded}` : `${symbol}${rounded.toFixed(2)}`
}

/**
 * Floor-safe guidance block for the system prompt. Only ever contains the
 * merchant's PUBLIC shipping rule (a charge and a threshold) — never the
 * internal minimum. Returns null when shipping awareness is off.
 */
export function shippingPromptBlock(config: ShippingConfig, currencySymbol: string): string | null {
  if (!config.enabled) return null
  const parts: string[] = [
    `SHIPPING TRANSPARENCY: This store charges ${formatMoney(config.flatCost, currencySymbol)} flat shipping` +
      (config.freeThreshold != null
        ? `, and orders at or above ${formatMoney(config.freeThreshold, currencySymbol)} ship FREE.`
        : `.`) +
      ` When you state a price, you may honestly show the TOTAL (item + shipping) so the shopper is never surprised at checkout.`,
  ]
  if (config.freeThreshold != null && config.flatCost > 0) {
    parts.push(
      `FREE-SHIPPING THRESHOLD: If the shopper is below ${formatMoney(config.freeThreshold, currencySymbol)}, you MAY point out — truthfully — that a little more gets them free shipping, and prefer that as a value-add over giving a deeper discount. Only state the real threshold above; never invent a different number.`,
    )
  }
  parts.push(
    `Never reveal or hint at any internal system minimum, margin or max discount — the hidden system minimum still applies and can never be breached or disclosed.`,
  )
  return parts.join(' ')
}

/**
 * A short, deterministic upsell line for the widget when the shopper is below
 * the free-shipping threshold. Null when there is nothing truthful to add.
 */
export function shippingUpsellLine(
  quote: ShippingQuote,
  currencySymbol: string,
  opts: { config: ShippingConfig },
): string | null {
  if (!opts.config.enabled) return null
  if (quote.freeShipping) return 'Shipping is on us for this order.'
  if (quote.remainingForFreeShipping <= 0) return null
  const amount = formatMoney(quote.remainingForFreeShipping, currencySymbol)
  if (quote.unitsForFreeShipping && quote.unitsForFreeShipping >= 1) {
    const unitWord = quote.unitsForFreeShipping === 1 ? '1 more' : `${quote.unitsForFreeShipping} more`
    return `Add ${amount} more (${unitWord} at this price) to unlock free shipping.`
  }
  return `Add ${amount} more to unlock free shipping.`
}
