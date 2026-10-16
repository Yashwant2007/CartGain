import prisma from '@/lib/db'
import { issueRetentionDiscount } from '@/lib/bargain/purchase'

/**
 * Marks any active BargainSessions associated with this cart as `abandoned`.
 * Called by the cart-abandonment processing flow when a cart enters recovery.
 *
 * Walked-away bargain sessions are then eligible for CartGain recovery campaigns
 * with the "missed bargain" context surfaced in the message body. Each abandoned
 * session also mints a retention discount at the last price offered, so the
 * recovery link can hand the shopper a ready-to-use deal.
 */
export async function markBargainSessionAbandonedByCartToken(cartToken: string): Promise<number> {
  if (!cartToken) return 0
  try {
    const active = await prisma.bargainSession.findMany({
      where: { cartToken, status: 'active' },
      select: { id: true },
    })
    if (active.length === 0) return 0
    await prisma.bargainSession.updateMany({
      where: { id: { in: active.map((s) => s.id) }, status: 'active' },
      data: { status: 'abandoned' },
    })
    // Best-effort: don't let a code-issuing failure break cart processing.
    await Promise.all(active.map((s) => issueRetentionDiscount(s.id).catch(() => null)))
    return active.length
  } catch (err) {
    console.error('[BARGAIN_ABANDONMENT_HOOK]', err)
    return 0
  }
}

/**
 * Lists bargain sessions for a store that walked away — used by cart-recovery
 * message templating to surface lost-deal context.
 */
export async function getAbandonedBargainContextForCartToken(cartToken: string): Promise<{
  sessionId: string
  shopifyProductId: string
  originalPrice: number
  lastCounterOffer: number | null
  discountCode: string | null
  purchaseUrl: string | null
} | null> {
  if (!cartToken) return null
  try {
    const session = await prisma.bargainSession.findFirst({
      where: { cartToken, status: { in: ['abandoned', 'rejected', 'expired'] } },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          where: { role: 'ai', offeredPrice: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { offeredPrice: true },
        },
      },
    })
    if (!session) return null
    return {
      sessionId: session.id,
      shopifyProductId: session.shopifyProductId,
      originalPrice: session.originalPrice,
      lastCounterOffer: session.messages[0]?.offeredPrice ?? null,
      discountCode: session.discountCode,
      purchaseUrl: session.purchaseUrl,
    }
  } catch (err) {
    console.error('[BARGAIN_ABANDONMENT_CTX]', err)
    return null
  }
}
