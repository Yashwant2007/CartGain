import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { PLANS } from '@/lib/payment'
import {
  resolveShopifyStoreForUser,
  resolveShopifyStoreForDomain,
  shopifyBillingAvailability,
  reconcileShopifySubscriptionForUser,
} from '@/lib/shopify-billing/service'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'
import { evaluateSubscriptionEntitlement } from '@/lib/subscription-entitlement'
import { isWooCommercePlatform, resolveBillingStore, resolveStoreSubscription } from '@/lib/billing/store-subscription'
import { isRazorpayConfigured, missingRazorpayBaseEnv, missingRazorpayPlanEnv } from '@/lib/billing/razorpay/config'
import { reconcileRazorpaySubscriptionForStore } from '@/lib/billing/razorpay/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request)
    if (!auth?.user?.id) {
      return unauthorizedResponse()
    }
    const userId = auth.user.id
    const store = await resolveBillingStore(userId, request.nextUrl.searchParams.get('storeId') || auth.store?.id)
    const isWooStore = !!store && isWooCommercePlatform(store.platform)
    let resolved = await resolveStoreSubscription(userId, store?.id, store)
    const isRazorpay = isWooStore || resolved?.kind === 'razorpay'

    if (request.nextUrl.searchParams.get('billing') === 'success') {
      if (isRazorpay && store) {
        await reconcileRazorpaySubscriptionForStore(userId, store.id).catch(() => null)
        resolved = await resolveStoreSubscription(userId, store.id, store)
      } else {
        await reconcileShopifySubscriptionForUser(userId)
        resolved = await resolveStoreSubscription(userId, store?.id, store)
      }
    }

    const shopifyStore = !isRazorpay && resolved?.shopDomain
      ? await resolveShopifyStoreForDomain(userId, resolved.shopDomain)
      : !isRazorpay
        ? await resolveShopifyStoreForUser(userId)
        : null
    const availability = shopifyBillingAvailability(shopifyStore)

    let cartsProcessed = 0
    let cartsRecovered = 0
    let activeCampaigns = 0
    if (store) {
      const processed = await prisma.message.groupBy({
        by: ['cartId'],
        where: {
          campaign: { userId },
          cart: { storeId: store.id },
          status: 'sent',
        },
      })
      cartsProcessed = processed.length
      cartsRecovered = await prisma.recoveredCart.count({ where: { storeId: store.id } })
      activeCampaigns = await prisma.campaign.count({ where: { storeId: store.id, isActive: true } })
    }

    const invoices = resolved
      ? isRazorpay
        ? await prisma.razorpayInvoice.findMany({
            where: { subscriptionId: resolved.id },
            orderBy: { createdAt: 'desc' },
          })
        : await prisma.invoice.findMany({
            where: { subscriptionId: resolved.id },
            orderBy: { createdAt: 'desc' },
          })
      : []

    let revenueSharePaid = resolved?.revenueSharePaid ?? 0
    if (resolved && isRazorpay) {
      const paidInvoiceIds = invoices.filter((invoice: any) => invoice.status === 'paid').map((invoice: any) => invoice.id)
      if (paidInvoiceIds.length) {
        const usage = await prisma.razorpayUsageEvent.aggregate({
          where: { subscriptionId: resolved.id, kind: 'revenue_share', invoiceId: { in: paidInvoiceIds } },
          _sum: { chargeAmount: true },
        })
        revenueSharePaid = usage._sum.chargeAmount || 0
      }
    }
    const entitlement = evaluateSubscriptionEntitlement(resolved)
    const resolvedPlan = Object.values(PLANS).find(p => p.id === entitlement.effectivePlanId) || PLANS.FREE
    const razorpayMissing = [...missingRazorpayBaseEnv(), ...missingRazorpayPlanEnv()]

    return NextResponse.json({
      subscription: resolved
        ? {
            id: resolved.id,
            plan: resolved.plan,
            status: resolved.status,
            provider: resolved.provider,
            billingKind: resolved.kind,
            storeId: resolved.storeId,
            shopDomain: resolved.shopDomain ?? null,
            revenueShareAccrued: resolved.revenueShareAccrued,
            revenueSharePaid,
            currentPeriodEnd: resolved.currentPeriodEnd,
            currentPeriodStart: resolved.currentPeriodStart,
            billingPeriod: resolved.billingPeriod ?? null,
            cancelAtPeriodEnd: resolved.cancelAtPeriodEnd ?? false,
            pendingPlanId: resolved.pendingPlanId ?? null,
            pendingBillingPeriod: resolved.pendingBillingPeriod ?? null,
            pendingStartAt: resolved.pendingStartAt ?? null,
            pendingAuthorizedAt: resolved.pendingAuthorizedAt ?? null,
            nextBillingAt: isRazorpay
              ? (await prisma.razorpaySubscription.findUnique({ where: { id: resolved.id }, select: { nextBillingAt: true } }))?.nextBillingAt ?? null
              : null,
            amount: resolved.amount ?? null,
            currency: resolved.currency ?? null,
            cartsUsedInPeriod: resolved.cartsUsedInPeriod,
            cartsLimit: resolvedPlan.maxCarts,
            overageEnabled: entitlement.isPaid && resolvedPlan.bargainOverageDealPrice > 0,
            overageMessages: resolved.overageMessages,
            cartOverage: resolved.cartOverage,
            resolvedPlan: {
              id: resolvedPlan.id,
              name: resolvedPlan.name,
              price: resolvedPlan.price,
              maxCampaigns: resolvedPlan.maxCampaigns,
              maxMessagesPerCustomer: resolvedPlan.maxMessagesPerCustomer,
            },
            entitlement: {
              effectivePlan: entitlement.effectivePlanId,
              isPaid: entitlement.isPaid,
              isEntitled: entitlement.isEntitled,
              isExpired: entitlement.isExpired,
              daysRemaining: entitlement.daysRemaining,
              renewalDueSoon: entitlement.renewalDueSoon,
            },
            activeCampaigns,
          }
        : null,
      store: store
        ? {
            id: store.id,
            name: store.name,
            domain: store.domain,
            platform: store.platform,
            currency: store.currency,
            cartsProcessed,
            cartsRecovered,
          }
        : null,
      invoices,
      plans: PLANS,
      billing: {
        provider: isRazorpay ? 'razorpay' : 'shopify',
        shopifyAvailable: availability.available,
        shopifyCurrency: availability.currency,
        shopifyUnavailableReason: availability.reason ?? null,
        shopifyTokenState: availability.tokenState,
        shopDomain: resolved?.shopDomain ?? shopifyStore?.domain ?? null,
        legacyBilling: !!resolved && !isRazorpay && resolved.provider !== 'shopify' &&
          resolved.provider !== 'manual' &&
          (resolved.status === 'active' || resolved.status === 'pending'),
        razorpayConfigured: isRazorpayConfigured() && razorpayMissing.length === 0,
        razorpayMissingConfig: razorpayMissing,
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
