// The WhatsApp `{{3}}` offer line. It is the only body variable that carries
// live links, so it must never be truncated in a way that cuts a URL in half.
// Keep the text side bounded (product names are merchant-controlled and can be
// arbitrarily long) and append the links verbatim at the end.

const MAX_PRODUCT_CHARS = 90
const MAX_NAME_CHARS = 32

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
  discountLabel?: string | null
  code?: string | null
  checkoutUrl: string
  bargainUrl: string
}

export function buildRecoveryOfferLine(input: RecoveryOfferLineInput): string {
  const firstName = shorten(oneLine(input.firstName), MAX_NAME_CHARS)
  const products = shorten(oneLine(input.productSummary), MAX_PRODUCT_CHARS) || 'cart'
  const prefix = firstName ? `${firstName}, ` : ''
  const discount = oneLine(input.discountLabel)
  const code = oneLine(input.code)

  // A code is only advertised when the merchant/Shopify actually produced one;
  // the copy layer never invents a discount.
  const offer =
    discount && code
      ? `your ${products} gets ${discount} — code ${code}`
      : `your ${products} is still saved`

  // Order is stable and labelled: checkout first, bargain second. The URLs are
  // appended untouched so a long product name can never consume their space.
  return `${prefix}${offer} — finish checkout: ${input.checkoutUrl} — or name your price: ${input.bargainUrl}`
}
