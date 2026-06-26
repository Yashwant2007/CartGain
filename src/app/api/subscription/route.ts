import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { PLANS } from '@/lib/payment'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
    })

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
    })

    const invoices = subscription
      ? await prisma.invoice.findMany({
          where: { subscriptionId: subscription.id },
          orderBy: { createdAt: 'desc' },
        })
      : []

    return NextResponse.json({
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            smsCredits: subscription.smsCredits,
            smsCreditsUsed: subscription.smsCreditsUsed,
            revenueShareAccrued: subscription.revenueShareAccrued,
            revenueSharePaid: subscription.revenueSharePaid,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      store: store
        ? { id: store.id, name: store.name, currency: store.currency }
        : null,
      invoices,
      plans: PLANS,
    })
  } catch (error) {
    console.error('Subscription fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
