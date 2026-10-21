import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { cancelRazorpaySubscription } from '@/lib/payment'
import { resolveShopifyStoreForUser, downgradeSubscriptionToFree } from '@/lib/shopify-billing/service'
import { cancelShopifySubscription } from '@/lib/shopify-billing/subscriptions'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Accepts the Shopify ID token (embedded admin) as well as the session
    // cookie (website) — see src/lib/embedded-auth.ts.
    const auth = await getAuthContext(request)
    if (!auth?.user?.id) {
      return unauthorizedResponse()
    }
    const userId = auth.user.id

    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    if (subscription.plan === 'free') {
      return NextResponse.json({ error: 'Already on the free plan' }, { status: 400 })
    }

    // Cancel at the gateway FIRST so the merchant stops being billed. Only if
    // the gateway confirms (or there is nothing to cancel) do we downgrade the
    // local plan. Otherwise the app would claim "free" while the gateway keeps
    // charging — the worst possible outcome for the merchant.
    let gatewayCancelled: boolean
    if (subscription.provider === 'shopify' && subscription.shopifySubscriptionId) {
      const store = await resolveShopifyStoreForUser(userId)
      if (!store) {
        return NextResponse.json(
          { error: 'Could not reach your connected Shopify store. Please reconnect it and try again.' },
          { status: 502 },
        )
      }
      gatewayCancelled = await cancelShopifySubscription(store, subscription.shopifySubscriptionId)
    } else {
      gatewayCancelled = await cancelRazorpaySubscription(subscription.subscriptionId)
    }

    if (!gatewayCancelled) {
      return NextResponse.json(
        { error: "We couldn't cancel your subscription at the payment gateway. Please try again or contact support." },
        { status: 502 },
      )
    }

    // Shared downgrade keeps plan/status/period/meters consistent with the
    // webhook-driven rollback path — two implementations = drift.
    await downgradeSubscriptionToFree(subscription.id)

    return NextResponse.json({ success: true, message: 'Downgraded to free plan' })
  } catch (error) {
    console.error('Cancel subscription error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}