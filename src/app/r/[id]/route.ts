import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { buildStoreCheckoutLink, isSafeDiscountCode } from '@/lib/recovery/links'

export const dynamic = 'force-dynamic'

/**
 * Click-tracking redirect for recovery messages.
 *
 *   /r/<cartId>?c=<channel>[&to=cart|bargain|checkout][&code=<discount>]
 *
 * Stamps `clickedAt` on the most recent SENT message for this cart (+channel),
 * bumps the daily `messagesClicked` analytics, then forwards the customer to
 * the right place:
 *
 *   (default)  → our branded cart page: items, checkout button, bargain widget
 *   to=bargain → the same page with the negotiation panel open
 *   to=checkout→ the store's own cart/checkout with the discount pre-applied
 *
 * This is what powers provable per-channel attribution ("WhatsApp drove X
 * clicks → Y recoveries"). Tracking failures never block the redirect — the
 * customer always reaches their cart.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cartId = params.id
  const channel = req.nextUrl.searchParams.get('c') || undefined
  const to = req.nextUrl.searchParams.get('to')
  const requestedCode = req.nextUrl.searchParams.get('code')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')

  let cart: { id: string; cartId: string; store: { domain: string } } | null = null
  try {
    cart = await prisma.cart.findUnique({
      where: { id: cartId },
      select: { id: true, cartId: true, store: { select: { domain: true } } },
    })
  } catch (err) {
    console.error('Recovery redirect cart lookup failed (redirect continues):', err)
  }

  let destination: string
  if (to === 'checkout' && cart?.store?.domain) {
    destination = buildStoreCheckoutLink({
      domain: cart.store.domain,
      shopifyCartId: cart.cartId,
      discountCode: isSafeDiscountCode(requestedCode) ? requestedCode : null,
    })
  } else if (to === 'bargain') {
    destination = `${appUrl}/cart/${cartId}?focus=bargain#bargain`
  } else {
    destination = `${appUrl}/cart/${cartId}`
  }

  try {
    const message = await prisma.message.findFirst({
      where: {
        cartId,
        status: { in: ['sent', 'delivered'] },
        ...(channel ? { channel } : {}),
      },
      orderBy: { sentAt: 'desc' },
    })

    // Only count the FIRST click per message so analytics aren't inflated by refreshes.
    if (message && !message.clickedAt) {
      await prisma.message.update({
        where: { id: message.id },
        data: { clickedAt: new Date() },
      })

      const trackedCart = await prisma.cart.findUnique({
        where: { id: cartId },
        include: { store: true },
      })

      if (trackedCart?.store) {
        const today = new Date(new Date().toDateString())
        await prisma.analytics.upsert({
          where: { userId_date: { userId: trackedCart.store.userId, date: today } },
          update: { messagesClicked: { increment: 1 } },
          create: { userId: trackedCart.store.userId, date: today, messagesClicked: 1 },
        })
      }
    }
  } catch (err) {
    console.error('Click tracking error (redirect continues):', err)
  }

  return NextResponse.redirect(destination, 302)
}
