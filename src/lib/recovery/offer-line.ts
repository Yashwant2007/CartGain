// The WhatsApp `{{3}}` offer line. Punchy, salesy, no repetition — one clear
// CTA per message. Links go as separate template buttons, not inline text.
// Keep it short so WhatsApp doesn't collapse it behind "Read more".

const MAX_PRODUCT_CHARS = 45
const MAX_NAME_CHARS = 28

function oneLine(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function shorten(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export type RecoveryOfferLineInput = {
  firstName?: string | null
  productSummary?: string | null
  productPrice?: number | null
  productQty?: number | null
  discountLabel?: string | null
  code?: string | null
  /** Currency symbol to show with the product price (e.g. ₹, $). */
  currencySymbol?: string | null
}

export function buildRecoveryOfferLine(input: RecoveryOfferLineInput): string {
  const products = shorten(oneLine(input.productSummary), MAX_PRODUCT_CHARS) || 'cart'
  const firstName = shorten(oneLine(input.firstName), MAX_NAME_CHARS)
  const discount = oneLine(input.discountLabel)
  const code = oneLine(input.code)

  // Price + qty in parens, e.g. "(₹299.00 × 2)". Empty when no price is known.
  let priceBit = ''
  if (typeof input.productPrice === 'number' && input.productPrice > 0) {
    const symbol = oneLine(input.currencySymbol)
    priceBit = ` (${symbol}${input.productPrice.toFixed(2)}`
    if (input.productQty && input.productQty > 1) priceBit += ` × ${input.productQty}`
    priceBit += ')'
  }

  // A code is only advertised when the merchant/Shopify actually produced one.
  let offer = ''
  if (discount && code) {
    offer = ` — ${discount}, code ${code}`
  } else if (code) {
    offer = ` — code ${code}`
  }

  const nameBit = firstName ? `${firstName}, ` : ''
  return `${nameBit}your ${products}${priceBit} is waiting 🛒${offer}. Grab it now!`
}
