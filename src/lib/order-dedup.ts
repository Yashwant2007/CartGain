import { redisSetNXOrNull } from '@/lib/redis'

// Max window in which a repeated orders/create delivery for the same order id is
// treated as a duplicate. Shopify retries deliveries with the same webhook id
// within hours, so a 1-hour self-expiring marker is plenty.
const DEDUP_TTL_MS = 60 * 60 * 1000

// Whether an order webhook has already been handled, using a short-lived Redis
// marker. Distinguishes "Redis down" (null) from a real claim result, because
// the previous `!redisSetNX(...)` treated a fresh claim and a Redis outage
// identically — every orders/create delivery was classified as a duplicate
// while Redis was unavailable, silently dropping ALL order attribution.
//
// The key is scoped to the store: Shopify order ids are per-shop sequences, so
// a global key made store B's order #1001 look like a replay of store A's
// order #1001 and dropped a real order.
//
// Reprocessing a genuine duplicate is safe: processOrderCreate guards with its
// own store-scoped shopifyOrderId / RecoveredCart unique constraint, so on an
// unusable Redis we return false and let the DB dedupe.
export async function isDuplicateOrder(orderId: string, storeId?: string): Promise<boolean> {
  const key = storeId ? `dedup:order:${storeId}:${orderId}` : `dedup:order:${orderId}`
  const stored = await redisSetNXOrNull(key, '1', DEDUP_TTL_MS)
  return stored === false
}
