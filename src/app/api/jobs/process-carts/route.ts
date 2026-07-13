import { NextRequest, NextResponse } from 'next/server'
import { addCartProcessingJob } from '@/lib/queue/processor'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import { initializeQueues } from '@/lib/queue/init'
import { sendAlertOnError } from '@/lib/alerter'
import { syncAbandonedCheckouts } from '@/lib/shopify'
import { getRedis, redisSet, redisGet } from '@/lib/redis'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const CURSOR_KEY = 'store_cursor'

async function getStoreCursor(): Promise<string | undefined> {
  const redis = getRedis()
  if (redis) {
    const cursor = await redisGet(CURSOR_KEY)
    if (cursor) return cursor
  }
  return undefined
}

async function saveStoreCursor(cursor: string | undefined): Promise<void> {
  if (!cursor) return
  const redis = getRedis()
  if (redis) {
    await redisSet(CURSOR_KEY, cursor, 30 * 60 * 1000)
  }
}

/**
 * Validate the request against JOB_SECRET. Accepts the secret via:
 *  - `x-job-secret` header
 *  - `Authorization: Bearer <secret>` header (Vercel Cron / QStash style)
 *  - `?secret=<secret>` query param (for schedulers that only configure a URL)
 * Returns true when authorized (or when no secret is configured, e.g. local dev).
 */
function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = (process.env.JOB_SECRET || '').replace(/^["']|["']$/g, '').trim()
  if (!configuredSecret) return true // no secret set — allow (local/dev)

  const headerSecret = request.headers.get('x-job-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return (
    headerSecret === configuredSecret ||
    bearer === configuredSecret ||
    querySecret === configuredSecret
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Ensure queue processors are running (idempotent)
    initializeQueues().catch(() => {})

    // Try Redis queue first, fall back to direct processing
    try {
      const job = await addCartProcessingJob()
      return NextResponse.json({
        message: 'Cart processing job queued',
        jobId: job.id,
        status: 'queued',
      })
    } catch {
      console.log('Redis not available — processing carts directly')
      const cursor = await getStoreCursor()
      const result = await processAbandonedCarts(25, cursor)
      if (result.nextCursor) {
        await saveStoreCursor(result.nextCursor)
      }
      return NextResponse.json({
        message: 'Carts processed directly',
        status: 'processed',
        result,
      })
    }
  } catch (error) {
    console.error('Process carts job error:', error)
    sendAlertOnError('Cart processing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as any).message },
      { status: 500 }
    )
  }
}

// GET endpoint — used by external schedulers (QStash / cron-job.org / Vercel Cron)
export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Ensure queue processors are running (idempotent)
    initializeQueues().catch(() => {})

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      // No jobId — cron trigger, process carts directly
      console.log('Cron trigger: syncing Shopify checkouts + processing abandoned carts')

      // Poll Shopify for abandoned checkouts and upsert them as carts — process 1 store per cycle
      let syncedCheckouts = 0
      try {
        const cursor = await getStoreCursor()
        const stores = await prisma.store.findMany({
          where: { platform: 'shopify', isActive: true, apiKey: { not: null } },
          select: { id: true, domain: true, apiKey: true, shopifyRefreshToken: true, shopifyTokenExpiresAt: true },
          orderBy: { id: 'asc' },
        })
        let targetStores = stores
        if (cursor) {
          const cursorIdx = stores.findIndex(s => s.id === cursor)
          if (cursorIdx >= 0) targetStores = stores.slice(cursorIdx + 1)
        }
        const batch = targetStores.slice(0, 1)
        if (batch.length > 0) {
          syncedCheckouts = await syncAbandonedCheckouts(batch[0]).catch(() => 0)
          await saveStoreCursor(batch[0].id)
        }
      } catch (err) {
        console.error('Shopify checkout sync error:', err)
      }

      const cursor = await getStoreCursor()
      const result = await processAbandonedCarts(25, cursor)
      if (result.nextCursor) {
        await saveStoreCursor(result.nextCursor)
      }
      return NextResponse.json({
        message: 'Carts processed',
        status: 'processed',
        syncedCheckouts,
        result,
      })
    }

    const { getQueue } = await import('@/lib/queue')
    const queue = getQueue()
    const job = await queue.getJob(jobId)

    if (!job) {
      return NextResponse.json(
        { message: 'Job not found' },
        { status: 404 }
      )
    }

    const state = await job.getState()
    const progress = job.progress()
    const data = job.data
    const returnValue = job.returnvalue

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
      data,
      returnValue,
    })
  } catch (error) {
    console.error('Get job status error:', error)
    sendAlertOnError('Cart processing job status', error).catch(() => {})
    return NextResponse.json(
      { message: 'Failed to get job status' },
      { status: 500 }
    )
  }
}
