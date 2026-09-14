import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { PLANS } from '@/lib/payment'
import {
  resolveShopifyStoreForUser,
  shopifyBillingAvailability,
  reconcileShopifySubscriptionForUser,
} from '@/lib/shopify-billing/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Safety net: when Shopify redirects the merchant back after approving a
    // subscription, pull the authoritative state immediately instead of waiting
    // for the app_subscriptions/update webhook to land.
    if (request.nextUrl.searchParams.get('billing') === 'success') {
      await reconcileShopifySubscriptionForUser(session.user.id)
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
    })

    const shopifyStore = await resolveShopifyStoreForUser(session.user.id)
    const availability = shopifyBillingAvailability(shopifyStore)

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
    })

    let cartsProcessed = 0
    let cartsRecovered = 0
    let activeCampaigns = 0
    if (store) {
      const processed = await prisma.message.groupBy({
        by: ['cartId'],
        where: {
          campaign: { userId: session.user.id },
          status: 'sent',
        },
      })
      cartsProcessed = processed.length
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
            provider: subscription.provider,
            shopDomain: subscription.shopDomain,
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
              id: resolvedPlan.id,
              name: resolvedPlan.name,
              price: resolvedPlan.price,
              maxCampaigns: resolvedPlan.maxCampaigns,
              maxMessagesPerCustomer: resolvedPlan.maxMessagesPerCustomer,
            },
            activeCampaigns,
          }
        : null,
      store: store
        ? { id: store.id, name: store.name, currency: store.currency, cartsProcessed, cartsRecovered }
        : null,
      invoices,
      plans: PLANS,
      billing: {
        provider: subscription?.provider === 'shopify' ? 'shopify' : 'razorpay',
        shopifyAvailable: availability.available,
        shopifyCurrency: availability.currency,
        shopifyUnavailableReason: availability.reason ?? null,
        shopDomain: subscription?.shopDomain ?? shopifyStore?.domain ?? null,
      },
      meta: {
        activeCampaigns,
      },
    })
  } catch (error) {
    console.error('Subscription fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
