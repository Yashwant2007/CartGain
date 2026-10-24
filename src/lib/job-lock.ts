import { getRedis } from './redis'

const locks = new Map<string, NodeJS.Timeout>()

export async function acquireLock(key: string, ttlMs: number = 300000): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true
  
  try {
    const result = await redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX')
    if (result === 'OK') {
      const timeout = setTimeout(() => {
        releaseLock(key).catch(() => {})
      }, ttlMs)
      locks.set(key, timeout)
      return true
    }
    return false
  } catch (error) {
    console.error('Lock acquire error:', error)
    return true // Fail open if Redis unavailable
  }
}

export async function releaseLock(key: string): Promise<void> {
  const redis = getRedis()
  const timeout = locks.get(key)
  if (timeout) {
    clearTimeout(timeout)
    locks.delete(key)
  }
  
  if (!redis) return
  
  try {
    await redis.del(`lock:${key}`)
  } catch (error) {
    console.error('Lock release error:', error)
  }
}

export async function extendLock(key: string, ttlMs: number = 300000): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true
  
  try {
    const result = await redis.expire(`lock:${key}`, Math.floor(ttlMs / 1000))
    return result === 1
  } catch (error) {
    console.error('Lock extend error:', error)
    return true
  }
}
