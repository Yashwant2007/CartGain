import { redisGet, redisSet } from '@/lib/redis'
import { isTrendCache, type TrendCache } from './types'

interface MemoryEntry {
  value: TrendCache
  expiresAt: number
}

const memory = new Map<string, MemoryEntry>()

export async function readTrendCache(key: string): Promise<TrendCache | null> {
  const local = memory.get(key)
  if (local) {
    if (local.expiresAt > Date.now()) return local.value
    memory.delete(key)
  }

  const raw = await redisGet(key)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isTrendCache(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeTrendCache(key: string, value: TrendCache, ttlMs: number): Promise<void> {
  memory.set(key, { value, expiresAt: Date.now() + ttlMs })
  try {
    await redisSet(key, JSON.stringify(value), ttlMs)
  } catch {
    return
  }
}

export function clearTrendCacheForTests(): void {
  memory.clear()
}
