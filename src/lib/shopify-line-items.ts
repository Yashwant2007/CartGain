/**
 * Shopify sends the same line item in several shapes:
 *   - `checkouts/*` webhooks: `image_url`, `product_id`, `variant_id`
 *   - `carts/*` webhooks: `image` may be absent entirely
 *   - REST `checkouts.json`: `product_id`, `variant_id`, sometimes no image
 *   - GraphQL-derived payloads: `image { src }`, ids as `gid://shopify/…`
 *
 * The old mapper only looked at `item.image?.src || item.image`, so every
 * real webhook produced `image: undefined` — the recovery messages then fell
 * back to the CartGain logo instead of the product the shopper left behind.
 * One shared normaliser keeps every capture path (webhook, REST sync) honest.
 */
export type NormalizedLineItem = {
  name: string
  description?: string
  price: number
  quantity: number
  image?: string
  productId?: string
  variantId?: string
  sku?: string
}

/** Turns `gid://shopify/Product/123` or `123` into `"123"`. */
export function toNumericId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const raw = String(value).trim()
  if (!raw) return undefined
  const gid = raw.match(/gid:\/\/shopify\/[A-Za-z]+\/(\d+)/)
  if (gid) return gid[1]
  return /^\d+$/.test(raw) ? raw : undefined
}

/** Normalises string / `{ src }` / `{ url }` image fields to an https URL. */
export function normalizeImageUrl(value: unknown): string | undefined {
  let raw: string | undefined
  if (typeof value === 'string') raw = value.trim()
  else if (value && typeof value === 'object') {
    const obj = value as { src?: unknown; url?: unknown }
    if (typeof obj.src === 'string' && obj.src.trim()) raw = obj.src.trim()
    else if (typeof obj.url === 'string' && obj.url.trim()) raw = obj.url.trim()
  }
  if (!raw) return undefined
  // Shopify CDN sometimes answers protocol-relative (`//cdn.shopify.com/…`),
  // which Meta rejects as an invalid image link.
  if (raw.startsWith('//')) raw = `https:${raw}`
  if (!/^https?:\/\//i.test(raw)) return undefined
  return raw
}

function toPrice(value: unknown): number {
  if (value !== null && typeof value === 'object') {
    const money = value as { amount?: unknown }
    const amount = Number(money.amount)
    return Number.isFinite(amount) ? amount : 0
  }
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeShopifyLineItems(raw: unknown): NormalizedLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: any) => {
    const price = toPrice(item?.price ?? item?.price_set?.shop_money)
    return {
      name: item?.title || item?.name || item?.product_title || 'Item',
      description: item?.variant_title || item?.variant?.title || undefined,
      price,
      quantity: Number(item?.quantity) || 1,
      image:
        normalizeImageUrl(item?.image_url) ||
        normalizeImageUrl(item?.image) ||
        normalizeImageUrl(item?.featured_image),
      productId: toNumericId(item?.product_id ?? item?.product?.id),
      variantId: toNumericId(item?.variant_id ?? item?.variant?.id),
      sku: typeof item?.sku === 'string' && item.sku.trim() ? item.sku.trim() : undefined,
    }
  })
}
