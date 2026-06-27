import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Click-tracking redirect for recovery messages.
 *
 *   /r/<cartId>?c=<channel>
 *
 * Stamps `clickedAt` on the most recent SENT message for this cart (+channel),
 * bumps the daily `messagesClicked` analytics, then forwards the customer to the
 * branded cart page. This is what powers provable per-channel attribution
 * ("WhatsApp drove X clicks → Y recoveries"). Tracking failures never block the
 * redirect — the customer always reaches their cart.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cartId = params.id
  const channel = req.nextUrl.searchParams.get('c') || undefined
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
  const destination = `${appUrl}/cart/${cartId}`

  try {
    const message = await prisma.message.findFirst({
      where: {
        cartId,
        status: 'sent',
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

      const cart = await prisma.cart.findUnique({
        where: { id: cartId },
        include: { store: true },
      })

      if (cart?.store) {
        const today = new Date(new Date().toDateString())
        await prisma.analytics.upsert({
          where: { userId_date: { userId: cart.store.userId, date: today } },
          update: { messagesClicked: { increment: 1 } },
          create: { userId: cart.store.userId, date: today, messagesClicked: 1 },
        })
      }
    }
  } catch (err) {
    console.error('Click tracking error (redirect continues):', err)
  }

  return NextResponse.redirect(destination, 302)
}
