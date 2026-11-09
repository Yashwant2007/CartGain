/**
 * Concurrency acceptance test for the recovery step claim.
 *
 * The sweep can be triggered concurrently (pg_cron + GitHub + manual). This
 * simulates 100 overlapping workers trying to claim the same step and asserts
 * the two invariants the database enforces in production:
 *   - a fresh (cart, channel, step) is created exactly once (P2002 for losers);
 *   - a retry of an existing failed row is claimed by exactly one worker.
 */
import { claimRecoveryStep, type ClaimStepDb } from '@/lib/recovery/claim'

type Row = { id: string; status: string }

function fakeDb() {
  const rows = new Map<string, Row>()
  const byKey = new Map<string, string>()
  let seq = 0

  const db: ClaimStepDb = {
    message: {
      create: async ({ data }: any) => {
        const key = `${data.cartId}:${data.channel}:${data.step}`
        if (byKey.has(key)) {
          const error: any = new Error('Unique constraint failed')
          error.code = 'P2002'
          throw error
        }
        const id = `msg-${++seq}`
        byKey.set(key, id)
        rows.set(id, { id, status: data.status })
        return { id }
      },
      updateMany: async ({ where, data }: any) => {
        const row = rows.get(where.id)
        if (!row || row.status !== where.status) return { count: 0 }
        row.status = data.status
        return { count: 1 }
      },
    },
  }

  return { db, rows, byKey }
}

function claimForStep(step: number) {
  return {
    cartId: 'cart-1',
    campaignId: 'camp-1',
    channel: 'email',
    step,
    status: 'pending',
  }
}

describe('claimRecoveryStep — 100 concurrent workers', () => {
  it('creates a fresh step exactly once', async () => {
    const { db } = fakeDb()
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        claimRecoveryStep(db, { existing: null, claim: claimForStep(0) }),
      ),
    )

    const winners = results.filter((r) => r.claimed)
    expect(winners).toHaveLength(1)
    expect(results.filter((r) => r.duplicate)).toHaveLength(99)
  })

  it('claims a failed retry exactly once', async () => {
    const { db } = fakeDb()
    const created = await claimRecoveryStep(db, { existing: null, claim: claimForStep(0) })
    await db.message.updateMany({ where: { id: created.messageId, status: 'pending' }, data: { status: 'failed' } })

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        claimRecoveryStep(db, {
          existing: { id: created.messageId!, status: 'failed' },
          claim: { ...claimForStep(0), status: 'pending' },
        }),
      ),
    )

    expect(results.filter((r) => r.claimed)).toHaveLength(1)
  })

  it('allows different steps to proceed independently', async () => {
    const { db } = fakeDb()
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        claimRecoveryStep(db, { existing: null, claim: claimForStep(i) }),
      ),
    )
    expect(results.every((r) => r.claimed)).toBe(true)
  })

  it('rethrows non-uniqueness database errors', async () => {
    const { db } = fakeDb()
    db.message.create = async () => {
      const error: any = new Error('connection reset')
      error.code = 'P1001'
      throw error
    }
    await expect(
      claimRecoveryStep(db, { existing: null, claim: claimForStep(0) }),
    ).rejects.toThrow('connection reset')
  })
})
