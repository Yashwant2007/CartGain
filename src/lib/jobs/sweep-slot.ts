import { getRedis, redisSetNX } from '@/lib/redis'

/**
 * Both Vercel Cron and the GitHub Actions workflow hit the same endpoint, and
 * when the cron works they overlap within seconds. Claiming a short-lived slot
 * makes the second trigger a no-op instead of a duplicate sweep — and because
 * the slot expires on its own, whichever trigger is alive still runs when the
 * other one dies (GitHub schedules are frequently late or skipped).
 */
export const SWEEP_SLOT_KEY = 'sweep:slot'
export const SWEEP_SLOT_TTL_MS = 4 * 60 * 1000

export async function claimSweepSlot(now = Date.now()): Promise<boolean> {
  if (!getRedis()) return true
  try {
    return await redisSetNX(SWEEP_SLOT_KEY, String(now), SWEEP_SLOT_TTL_MS)
  } catch {
    // Redis hiccup must never stop recovery — duplicate work is safer than none.
    return true
  }
}
