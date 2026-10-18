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
// Reprocessing a genuine duplicate is safe: processOrderCreate guards with its
// own shopifyOrderId / RecoveredCart unique constraint, so on an unusable Redis
// we return false and let the DB dedupe.
export async function isDuplicateOrder(orderId: string): Promise<boolean> {
  const stored = await redisSetNXOrNull(`dedup:order:${orderId}`, '1', DEDUP_TTL_MS)
  return stored === false
}
