import { NextRequest, NextResponse } from 'next/server'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import { initializeQueues } from '@/lib/queue/init'
import { sendAlertOnError } from '@/lib/alerter'
import { syncAbandonedCheckouts } from '@/lib/shopify'
import { getRedis, redisSet, redisGet } from '@/lib/redis'
import prisma from '@/lib/db'
import { requireJobAuth } from '@/lib/job-auth'
import { claimSweepSlot } from '@/lib/jobs/sweep-slot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CURSOR_KEY = 'campaign_cursor'
// The Shopify checkout-sync pass and the cart-processing pass advance through
// DIFFERENT sets (sync = stores, processing = active campaigns). Sharing one
// cursor made each pass skip whatever the other just advanced to. Two
// independent cursors fix it. The processing cursor stores a CAMPAIGN id (not
// a store id): a store with duplicate active campaigns would otherwise pin the
// rotation on the first duplicate forever.
const SYNC_CURSOR_KEY = 'checkout_sync_cursor'

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

async function getSyncCursor(): Promise<string | undefined> {
  const redis = getRedis()
  if (redis) {
    const cursor = await redisGet(SYNC_CURSOR_KEY)
    if (cursor) return cursor
  }
  return undefined
}

async function saveSyncCursor(cursor: string | undefined): Promise<void> {
  if (!cursor) return
  const redis = getRedis()
  if (redis) {
    await redisSet(SYNC_CURSOR_KEY, cursor, 30 * 60 * 1000)
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    initializeQueues().catch(() => {})

    // Cron and GitHub Actions both fire this endpoint; only one sweep per slot.
    if (!(await claimSweepSlot())) {
      return NextResponse.json({
        message: 'Skipped — another sweep claimed this slot',
        status: 'skipped',
      })
    }

    // Process inline. The Redis queue only helps when a worker is running, and
    // no worker is deployed on Vercel — enqueueing returned "queued" while
    // nothing ever drained the queue, so recovery silently stopped.
    const cursor = await getStoreCursor()
    const result = await processAbandonedCarts(25, cursor)
    if (result.nextCursor) {
      await saveStoreCursor(result.nextCursor)
    }
    return NextResponse.json({
      message: 'Carts processed',
      status: 'processed',
      result,
    })
  } catch (error) {
    console.error('Process carts job error:', error)
    sendAlertOnError('Cart processing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    initializeQueues().catch(() => {})

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      // Cron and GitHub Actions both fire this endpoint; only one sweep per slot.
      if (!(await claimSweepSlot())) {
        return NextResponse.json({
          message: 'Skipped — another sweep claimed this slot',
          status: 'skipped',
        })
      }

      let syncedCheckouts = 0
      try {
        const syncCursor = await getSyncCursor()
        const stores = await prisma.store.findMany({
          where: { platform: 'shopify', isActive: true, apiKey: { not: null } },
          select: { id: true, domain: true, apiKey: true, shopifyRefreshToken: true, shopifyTokenExpiresAt: true },
          orderBy: { id: 'asc' },
        })
        let targetStores = stores
        if (syncCursor) {
          const cursorIdx = stores.findIndex(s => s.id === syncCursor)
          if (cursorIdx >= 0) targetStores = stores.slice(cursorIdx + 1)
        }
        const batch = targetStores.slice(0, 1)
        if (batch.length > 0) {
          const result = await syncAbandonedCheckouts(batch[0]).catch(() => 0)
          if (result === -1) {
            console.log(`Skipping store ${batch[0].domain} due to auth failure`)
          } else {
            syncedCheckouts = result
          }
          await saveSyncCursor(batch[0].id)
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

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
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
