let Bull: any = null
let queueInstance: any = null
let fallbackInterval: any = null

if (typeof window === 'undefined') {
  try {
    Bull = require('bull')
  } catch (e) {
    console.log('Bull not available — will use direct processing fallback')
  }
}

function hasValidRedisConfig(): boolean {
  const url = process.env.REDIS_URL
  if (!url && !process.env.REDIS_HOST) return false
  if (url) {
    const lower = url.toLowerCase()
    if (lower.includes('placeholder') || lower.includes('your-instance') || lower.includes('password@your') || lower === '') return false
    if (url.startsWith('redis://') || url.startsWith('rediss://')) return true
  }
  return !!process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost'
}

function getCartQueue(): any {
  if (!queueInstance && Bull && hasValidRedisConfig()) {
    try {
      const redisUrl = process.env.REDIS_URL
      const redisConfig = redisUrl
        ? { url: redisUrl, maxRetriesPerRequest: null, enableReadyCheck: false, tls: redisUrl.startsWith('rediss://') ? {} : undefined }
        : {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          }
      queueInstance = new Bull('process-carts', {
        redis: redisConfig,
        settings: {
          lockDuration: 30000,
          lockRenewTime: 15000,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      })
      setupQueueListeners()
    } catch (e: any) {
      console.log('Redis not available — using direct processing fallback:', e.message)
      queueInstance = null
    }
  }
  return queueInstance
}

export function getQueue(): any {
  return getCartQueue()
}

export function hasRedis(): boolean {
  try {
    const q = getCartQueue()
    return q !== null && q !== undefined
  } catch {
    return false
  }
}

export function startFallbackProcessor(processFn: () => Promise<any>): void {
  if (fallbackInterval) return
  console.log('Starting fallback cart processor (every 60s)')
  processFn().catch(() => {})
  fallbackInterval = setInterval(() => {
    processFn().catch((err) => console.error('Fallback processor error:', err))
  }, 60_000)
}

export function stopFallbackProcessor(): void {
  if (fallbackInterval) {
    clearInterval(fallbackInterval)
    fallbackInterval = null
  }
}

export const cartQueue = {
  getJob: async (jobId: string) => getCartQueue()?.getJob(jobId),
  add: async (data: any, opts?: any) => getCartQueue()?.add(data, opts),
  on: (event: string, callback: any) => getCartQueue()?.on(event, callback),
}

export function setupQueueListeners() {
  const queue = getCartQueue()
  if (!queue) return

  queue.on('completed', (job: any) => console.log(`Job ${job.id} completed`))
  queue.on('failed', (job: any, err: any) => console.error(`Job ${job.id} failed:`, err.message))
  queue.on('error', (err: any) => console.error('Queue error:', err.message))
  queue.on('active', (job: any) => console.log(`Job ${job.id} is processing...`))
  queue.on('connect', () => console.log('Queue connected to Redis'))
  queue.on('ready', () => console.log('Queue ready'))
}
