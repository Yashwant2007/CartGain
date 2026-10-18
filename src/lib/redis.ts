import Redis from 'ioredis'

let client: Redis | null = null

function getRedis(): Redis | null {
  if (client) return client

  const url = process.env.REDIS_URL
  try {
    // commandTimeout/connectTimeout prevent queued commands from hanging
    // forever when Redis is unreachable — an unresponsiveness that (if left)
    // would make HTTP handlers holding the await time out upstream.
    const safetyOpts = { maxRetriesPerRequest: null, enableOfflineQueue: true, lazyConnect: true, commandTimeout: 6000, connectTimeout: 6000 }
    if (url) {
      client = new Redis(url, { ...safetyOpts, tls: url.startsWith('rediss://') ? {} : undefined })
    } else {
      const host = process.env.REDIS_HOST
      if (!host || host === 'localhost' || host === '127.0.0.1') return null
      const port = parseInt(process.env.REDIS_PORT || '6379')
      const password = process.env.REDIS_PASSWORD
      client = new Redis({ host, port, password, ...safetyOpts })
    }
    client.on('error', (err) => console.error('Redis error:', err.message))
  } catch (e: any) {
    console.log('Redis unavailable:', e.message)
    client = null
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

// Like redisIncr but distinguishes "Redis unusable" (returns null) from a real
// counter value. Callers that MUST NOT silently skip work when Redis is down
// (rate limiting) use this so they can fall back to a local limiter instead of
// treating an absent Redis as "count 0 = no requests".
export async function redisIncrOrNull(key: string): Promise<number | null> {
  const r = getRedis()
  if (!r) return null
  try { return await r.incr(key) } catch { return null }
}

// ttlMs is in MILLISECONDS (uses PEXPIRE). Pass milliseconds — passing seconds
// silently sets a TTL ~1000x too short and defeats the counter it guards.
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

// Like redisSetNX but distinguishes "Redis unusable" (returns null) from a real
// claim result (true = acquired, false = already held). Callers that must NOT
// silently skip work when Redis is down use this, instead of treating an absent
// Redis as "already claimed". See redisIncrOrNull for the same idea on counters.
export async function redisSetNXOrNull(key: string, value: string, ttlMs: number): Promise<boolean | null> {
  const r = getRedis()
  if (!r) return null
  try {
    const result = await r.set(key, value, 'PX', ttlMs, 'NX')
    return result === 'OK'
  } catch { return null }
}

// Append to a Redis list, optionally trimming it to the newest `maxLen` entries.
// Used for inbound event streams where every event matters (unlike redisSet,
// which would overwrite the previous value).
export async function redisLPush(key: string, value: string, maxLen?: number): Promise<number> {
  const r = getRedis()
  if (!r) return 0
  try {
    const len = await r.lpush(key, value)
    if (maxLen && len > maxLen) await r.ltrim(key, 0, maxLen - 1)
    return len
  } catch { return 0 }
}

export async function redisLRange(key: string, start: number, stop: number): Promise<string[]> {
  const r = getRedis()
  if (!r) return []
  try { return await r.lrange(key, start, stop) } catch { return [] }
}

export { getRedis }
