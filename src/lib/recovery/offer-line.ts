// The WhatsApp `{{3}}` offer line. It is the only body variable that carries a
// live link, so it must never be truncated in a way that cuts a URL in half.
// Keep the text side bounded (product names are merchant-controlled and can be
// arbitrarily long) and append the link verbatim at the end.
//
// The template already greets the customer with {{1}}, so this line does not
// repeat the name. One short CTA is better than two long links: WhatsApp
// collapses long messages behind "Read more", which hides the CTA.

const MAX_PRODUCT_CHARS = 45

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
  /** The single checkout CTA. */
  checkoutUrl: string
  /** Retained for callers that still pass it; no longer rendered. */
  bargainUrl?: string | null
}

export function buildRecoveryOfferLine(input: RecoveryOfferLineInput): string {
  const products = shorten(oneLine(input.productSummary), MAX_PRODUCT_CHARS) || 'cart'
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

  // A code is only advertised when the merchant/Shopify actually produced one;
  // the copy layer never invents a discount.
  let offer = ''
  if (discount && code) {
    const nameBit = input.firstName ? `${input.firstName}, ` : ''
    offer = ` — ${nameBit}I've set aside ${discount} for you. Use code ${code}`
  } else if (code) {
    const nameBit = input.firstName ? `${input.firstName}, ` : ''
    offer = ` — ${nameBit}use code ${code}`
  }

  return `${input.firstName ? `${input.firstName}, ` : ''}Your ${products}${priceBit} is still saved.${offer}\n🛒 Complete checkout: ${input.checkoutUrl}`
}
