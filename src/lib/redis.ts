import Redis from 'ioredis'

let client: Redis | null = null

function getRedis(): Redis | null {
  if (client) return client

  const host = process.env.REDIS_HOST
  if (host) {
    const port = parseInt(process.env.REDIS_PORT || '6379')
    const password = process.env.REDIS_PASSWORD
    try {
      client = new Redis({ host, port, password, maxRetriesPerRequest: null, enableOfflineQueue: true, lazyConnect: true })
      client.on('error', (err) => console.error('Redis error:', err.message))
    } catch (e: any) {
      console.log('Redis unavailable:', e.message)
      client = null
    }
  }
  return client
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis()
  if (!r) return null
  try { return await r.get(key) } catch { return null }
}

export async function redisSet(key: string, value: string, ttlMs?: number): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    if (ttlMs) await r.set(key, value, 'PX', ttlMs)
    else await r.set(key, value)
  } catch {}
}

export async function redisDel(key: string): Promise<void> {
  const r = getRedis()
  if (!r) return
  try { await r.del(key) } catch {}
}

export async function redisIncr(key: string): Promise<number> {
  const r = getRedis()
  if (!r) return 0
  try { return await r.incr(key) } catch { return 0 }
}

export async function redisExpire(key: string, ttlMs: number): Promise<void> {
  const r = getRedis()
  if (!r) return
  try { await r.pexpire(key, ttlMs) } catch {}
}

export async function redisSetNX(key: string, value: string, ttlMs: number): Promise<boolean> {
  const r = getRedis()
  if (!r) return false
  try {
    const result = await r.set(key, value, 'PX', ttlMs, 'NX')
    return result === 'OK'
  } catch { return false }
}

export { getRedis }
