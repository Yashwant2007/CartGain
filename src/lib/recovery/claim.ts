/**
 * Atomic claim of a single recovery step.
 *
 * The sweep is triggered from multiple places (Supabase pg_cron, GitHub, manual
 * calls) and those triggers can overlap. Two invariants must hold under
 * concurrency:
 *   1. at most one worker may send a given (cart, channel, step), and
 *   2. a retry of a `failed` row may only proceed if no other worker changed it
 *      since it was read.
 *
 * The database enforces (1) with the unique index on
 * `Message(cartId, channel, step)`; (2) is a conditional `updateMany` on the
 * status that was read. Both live here so the sweep and the concurrency test
 * exercise exactly the same code.
 */

export type ClaimStepExisting = {
  id: string
  status: string
}

export type ClaimStepResult = {
  claimed: boolean
  /** Present only when this call won the claim. */
  messageId: string | null
  /** True when another worker created the same row first (P2002). */
  duplicate?: boolean
}

export type ClaimStepDb = {
  message: {
    // `any` keeps Prisma's generated argument types from leaking into this
    // small, deliberately narrow adapter.
    create: (args: any) => Promise<{ id: string }>
    updateMany: (args: any) => Promise<{ count: number }>
  }
}

export async function claimRecoveryStep(
  db: ClaimStepDb,
  input: {
    existing: ClaimStepExisting | null
    claim: Record<string, unknown>
  },
): Promise<ClaimStepResult> {
  if (input.existing) {
    // Condition on the status we just read. If another worker already moved the
    // row (pending → sent, failed → pending, …) this update matches 0 rows and
    // the caller must not send.
    const result = await db.message.updateMany({
      where: { id: input.existing.id, status: input.existing.status },
      data: input.claim,
    })
    if (result.count === 0) return { claimed: false, messageId: null }
    return { claimed: true, messageId: input.existing.id }
  }

  try {
    const created = await db.message.create({ data: input.claim })
    return { claimed: true, messageId: created.id }
  } catch (error: any) {
    if (error?.code === 'P2002') {
      // Another worker claimed this (cart, channel, step) first.
      return { claimed: false, messageId: null, duplicate: true }
    }
    throw error
  }
}
