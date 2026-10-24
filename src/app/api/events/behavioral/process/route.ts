import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { resolveCustomerIdentity, createOrUpdateJourney } from '@/lib/recovery/journeys/service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const storeId = typeof body.storeId === 'string' ? body.storeId : null
    const limit = Math.min(Number(body.limit) || 50, 200)

    const where: any = {
      eventType: { in: ['product_engagement_threshold_reached', 'cart_item_added', 'checkout_started', 'payment_failed', 'checkout_abandoned'] },
    }
    if (storeId) where.storeId = storeId

    const events = await prisma.behavioralEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit,
    })

    let created = 0
    for (const ev of events) {
      const identity = await resolveCustomerIdentity({
        storeId: ev.storeId,
        shopifyCustomerId: ev.customerId,
        email: ev.email,
        phone: ev.phone,
      })

      if (ev.eventType === 'product_engagement_threshold_reached' && identity && ev.productId) {
        await createOrUpdateJourney({
          storeId: ev.storeId,
          journeyType: 'product_browse',
          customerIdentityId: identity.id,
          sessionId: ev.sessionId,
          productId: ev.productId,
          priority: 1,
          delayMinutes: 60,
          metadata: { source: 'behavioral', eventId: ev.id },
        })
        created++
        continue
      }

      if (ev.eventType === 'cart_item_added') {
        await createOrUpdateJourney({
          storeId: ev.storeId,
          journeyType: 'add_to_cart',
          customerIdentityId: identity?.id || null,
          sessionId: ev.sessionId,
          cartId: ev.cartId,
          productId: ev.productId,
          priority: 5,
          delayMinutes: 45,
          metadata: { source: 'behavioral', eventId: ev.id },
        })
        created++
        continue
      }

      if (ev.eventType === 'checkout_started' || ev.eventType === 'checkout_abandoned') {
        await createOrUpdateJourney({
          storeId: ev.storeId,
          journeyType: 'checkout_abandon',
          customerIdentityId: identity?.id || null,
          sessionId: ev.sessionId,
          cartId: ev.cartId,
          checkoutId: ev.checkoutId,
          priority: 10,
          delayMinutes: 30,
          metadata: { source: 'behavioral', eventId: ev.id },
        })
        created++
        continue
      }

      if (ev.eventType === 'payment_failed') {
        await createOrUpdateJourney({
          storeId: ev.storeId,
          journeyType: 'payment_failed',
          customerIdentityId: identity?.id || null,
          sessionId: ev.sessionId,
          cartId: ev.cartId,
          checkoutId: ev.checkoutId,
          priority: 15,
          delayMinutes: 15,
          metadata: { source: 'behavioral', eventId: ev.id },
        })
        created++
        continue
      }
    }

    return NextResponse.json({ ok: true, processed: events.length, created })
  } catch (err) {
    console.error('process behavioral journeys error:', err)
    return NextResponse.json({ message: 'Failed' }, { status: 500 })
  }
}
