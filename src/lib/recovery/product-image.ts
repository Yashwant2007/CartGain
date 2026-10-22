import { getAccessToken } from '@/lib/shopify'
import { redisGet, redisSet } from '@/lib/redis'
import { normalizeImageUrl, toNumericId, type NormalizedLineItem } from '@/lib/shopify-line-items'

const API_VERSION = '2026-04'
const IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 15 * 60 * 1000
const MISS = '__none__'

type StoreForImage = {
  id: string
  domain: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}

// Survives Redis-less deployments (and repeated carts of the same product in
// one sweep) without ever growing past a few hundred entries.
const memoryCache = new Map<string, { value: string | null; expiresAt: number }>()
const MEMORY_MAX = 500

function readMemory(key: string): string | null | undefined {
  const hit = memoryCache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return undefined
  }
  return hit.value
}

function writeMemory(key: string, value: string | null, ttlMs: number): void {
  if (memoryCache.size >= MEMORY_MAX) {
    const oldest = memoryCache.keys().next().value
    if (oldest) memoryCache.delete(oldest)
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * The product photo the shopper actually left behind, looked up by product id
 * when the capture payload carried no image URL. Cached for a week because a
 * product's hero image rarely changes and a sweep can revisit the same product
 * for many carts.
 */
export async function fetchShopifyProductImage(
  store: StoreForImage,
  productId: string,
): Promise<string | undefined> {
  const id = toNumericId(productId)
  if (!id) return undefined

  const cacheKey = `product-image:${store.id}:${id}`
  const fromMemory = readMemory(cacheKey)
  if (fromMemory !== undefined) return fromMemory ?? undefined

  const cached = await redisGet(cacheKey).catch(() => null)
  if (cached) {
    const value = cached === MISS ? null : cached
    writeMemory(cacheKey, value, value ? IMAGE_TTL_MS : MISS_TTL_MS)
    return value ?? undefined
  }

  try {
    const token = await getAccessToken(store)
    if (!token) return undefined
    const res = await fetch(
      `https://${store.domain}/admin/api/${API_VERSION}/products/${id}.json?fields=id,image,images`,
      {
        headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) {
      // 401/403 means reconnect; don't cache that as "no photo".
      if (res.status === 401 || res.status === 403) return undefined
      await redisSet(cacheKey, MISS, MISS_TTL_MS).catch(() => {})
      writeMemory(cacheKey, null, MISS_TTL_MS)
      return undefined
    }
    const json = await res.json().catch(() => null)
    const product = json?.product
    const url =
      normalizeImageUrl(product?.image) ||
      (Array.isArray(product?.images)
        ? product.images.map((image: unknown) => normalizeImageUrl(image)).find(Boolean)
        : undefined)

    await redisSet(cacheKey, url || MISS, url ? IMAGE_TTL_MS : MISS_TTL_MS).catch(() => {})
    writeMemory(cacheKey, url ?? null, url ? IMAGE_TTL_MS : MISS_TTL_MS)
    return url
  } catch (error: any) {
    console.warn(`Product image lookup failed for ${store.domain} #${id}:`, error?.message || error)
    return undefined
  }
}

export function firstLineItemImage(items: Array<Partial<NormalizedLineItem>>): string | undefined {
  for (const item of items) {
    const url = normalizeImageUrl(item?.image)
    if (url) return url
  }
  return undefined
}

/**
 * Best available product photo for a cart, in order of confidence:
 *   1. the image captured with the line item (exact product/variant photo)
 *   2. the product's current hero image, fetched from Shopify by product id
 *   3. nothing — the caller decides the last-resort fallback
 */
export async function resolveCartProductImage(
  store: StoreForImage,
  items: Array<Partial<NormalizedLineItem>>,
): Promise<string | undefined> {
  const direct = firstLineItemImage(items)
  if (direct) return direct

  for (const item of items.slice(0, 3)) {
    const productId = toNumericId(item?.productId)
    if (!productId) continue
    const image = await fetchShopifyProductImage(store, productId)
    if (image) return image
  }
  return undefined
}

/**
 * Fills in missing item photos (and persists them for later steps and the
 * email), so one lookup serves the whole cart lifecycle.
 */
export async function enrichCartItemsWithImages<T extends Partial<NormalizedLineItem>>(
  store: StoreForImage,
  items: T[],
): Promise<{ items: T[]; changed: boolean }> {
  const enriched = items.map((item) => ({ ...item }))
  let changed = false

  for (const item of enriched) {
    if (normalizeImageUrl(item.image)) continue
    const productId = toNumericId(item.productId)
    if (!productId) continue
    const image = await fetchShopifyProductImage(store, productId)
    if (!image) continue
    item.image = image as T['image']
    changed = true
  }

  return { items: enriched, changed }
}
