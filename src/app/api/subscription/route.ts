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

    let cartsRecovered = 0
    let activeCampaigns = 0
    if (store) {
      cartsRecovered = await prisma.recoveredCart.count({
        where: { storeId: store.id },
      })
      activeCampaigns = await prisma.campaign.count({
        where: { storeId: store.id, isActive: true },
      })
    }

    const invoices = subscription
      ? await prisma.invoice.findMany({
          where: { subscriptionId: subscription.id },
          orderBy: { createdAt: 'desc' },
        })
      : []

    const resolvedPlan = subscription
      ? Object.values(PLANS).find(p => p.id === subscription.plan) || PLANS.FREE
      : PLANS.FREE

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
            cartsUsedInPeriod: subscription.cartsUsedInPeriod,
            cartsLimit: subscription.cartsLimit,
            overageEnabled: subscription.overageEnabled,
            overageMessages: subscription.overageMessages,
            resolvedPlan: {
              name: resolvedPlan.name,
              maxCampaigns: resolvedPlan.maxCampaigns,
              maxMessagesPerCustomer: resolvedPlan.maxMessagesPerCustomer,
            },
            activeCampaigns,
          }
        : null,
      store: store
        ? { id: store.id, name: store.name, currency: store.currency, cartsRecovered }
        : null,
      invoices,
      plans: PLANS,
      meta: {
        activeCampaigns,
      },
    })
  } catch (error) {
    console.error('Subscription fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
