import { redisSetNX, redisDel, getRedis } from './redis'

const LOCK_TTL = 5 * 60 * 1000

export async function acquireLock(key: string): Promise<boolean> {
  const lockKey = `lock:${key}`
  // If Redis is not available, proceed without a distributed lock.
  // Without this, the job would never run when Redis is down.
  if (!getRedis()) return true
  const acquired = await redisSetNX(lockKey, '1', LOCK_TTL)
  return acquired
}

export async function releaseLock(key: string): Promise<void> {
  const lockKey = `lock:${key}`
  await redisDel(lockKey)
}
