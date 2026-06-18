import { redisIncr, redisExpire } from './redis'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 30

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const redisKey = `ratelimit:${key}`

  const count = await redisIncr(redisKey)
  if (count === 1) {
    await redisExpire(redisKey, WINDOW_MS)
  }

  if (count > MAX_REQUESTS) {
    return { allowed: false, retryAfter: 60 }
  }

  return { allowed: true, retryAfter: 0 }
}
