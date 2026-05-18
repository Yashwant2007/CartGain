let Bull: any = null;
let queueInstance: any = null;

// Server-side only - load Bull when needed
if (typeof window === 'undefined') {
  try {
    // eslint-disable-next-line global-require
    Bull = require('bull');
  } catch (e) {
    console.error('Failed to load Bull:', e);
  }
}

// Lazy initialization - only create queue when needed
function getCartQueue(): any {
  if (!queueInstance && Bull) {
    queueInstance = new Bull('process-carts', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
      settings: {
        lockDuration: 30000,
        lockRenewTime: 15000,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    })
    
    setupQueueListeners()
  }
  return queueInstance
}

export function getQueue(): any {
  return getCartQueue()
}

// Export queue object for backwards compatibility
export const cartQueue = {
  getJob: async (jobId: string) => getCartQueue().getJob(jobId),
  add: async (data: any, opts?: any) => getCartQueue().add(data, opts),
  on: (event: string, callback: any) => getCartQueue().on(event, callback),
}

// Export queue events for monitoring
export function setupQueueListeners() {
  const queue = getCartQueue()

  queue.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed`)
  })

  queue.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err.message)
  })

  queue.on('error', (err) => {
    console.error('Queue error:', err.message)
  })

  queue.on('active', (job) => {
    console.log(`🔄 Job ${job.id} is processing...`)
  })

  queue.on('connect', () => {
    console.log('✅ Queue connected to Redis')
  })

  queue.on('ready', () => {
    console.log('✅ Queue ready')
  })
}
