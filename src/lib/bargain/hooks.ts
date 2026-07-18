import prisma from '@/lib/db'

/**
 * Marks any active BargainSessions associated with this cart as `abandoned`.
 * Called by the cart-abandonment processing flow when a cart enters recovery.
 *
 * Walked-away bargain sessions are then eligible for CartGain recovery campaigns
 * with the "missed bargain" context surfaced in the message body.
 */
export async function markBargainSessionAbandonedByCartToken(cartToken: string): Promise<number> {
  if (!cartToken) return 0
  try {
    const result = await prisma.bargainSession.updateMany({
      where: {
        cartToken,
        status: 'active',
      },
      data: { status: 'abandoned' },
    })
    return result.count
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
} | null> {
  if (!cartToken) return null
  try {
    const session = await prisma.bargainSession.findFirst({
      where: { cartToken, status: 'abandoned' },
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
    }
  } catch (err) {
    console.error('[BARGAIN_ABANDONMENT_CTX]', err)
    return null
  }
}
