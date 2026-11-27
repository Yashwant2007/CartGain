import prisma from '@/lib/db'

export type BillingKind = 'shopify' | 'razorpay'

export interface ResolvedStoreSubscription {
  kind: BillingKind
  id: string
  userId: string
  storeId: string | null
  provider: string
  plan: string
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  customerId?: string | null
  subscriptionId?: string | null
  shopDomain?: string | null
  cartsUsedInPeriod: number
  overageMessages: number
  cartOverage: number
  bargainSessionsUsed: number
  bargainDealsUsed: number
  bargainOverageDeals: number
  revenueShareAccrued: number
  revenueSharePaid: number
  bargainAccrued: number
  billingPeriod?: string
  cancelAtPeriodEnd?: boolean
  gracePeriodEnd?: Date | null
  pendingPlanId?: string | null
  pendingBillingPeriod?: string | null
  pendingStartAt?: Date | null
  pendingAuthorizedAt?: Date | null
  amount?: number
  currency?: string
}

export function isWooCommercePlatform(platform: string | null | undefined): boolean {
  return (platform || '').toLowerCase() === 'woocommerce'
}

export async function resolveBillingStore(userId: string, storeId?: string | null) {
  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: storeId, userId } })
    return store || null
  }
  return prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
}

function normalizeRazorpaySubscription(row: any): ResolvedStoreSubscription {
  return {
    kind: 'razorpay',
    id: row.id,
    userId: row.userId,
    storeId: row.storeId,
    provider: 'razorpay',
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    revenueSharePaid: 0,
    customerId: row.razorpayCustomerId,
    subscriptionId: row.razorpaySubscriptionId,
    cartsUsedInPeriod: row.cartsUsedInPeriod || 0,
    overageMessages: row.overageMessages || 0,
    cartOverage: row.cartOverage || 0,
    bargainSessionsUsed: row.bargainSessionsUsed || 0,
    bargainDealsUsed: row.bargainDealsUsed || 0,
    bargainOverageDeals: row.bargainOverageDeals || 0,
    revenueShareAccrued: row.revenueShareAccrued || 0,
    bargainAccrued: row.bargainAccrued || 0,
    billingPeriod: row.billingPeriod,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    gracePeriodEnd: row.gracePeriodEnd,
    pendingPlanId: row.pendingPlanId,
    pendingBillingPeriod: row.pendingBillingPeriod,
    pendingStartAt: row.pendingStartAt,
    pendingAuthorizedAt: row.pendingAuthorizedAt,
    amount: row.amount,
    currency: row.currency,
  }
}

function normalizeShopifySubscription(row: any): ResolvedStoreSubscription {
  return {
    kind: 'shopify',
    id: row.id,
    userId: row.userId,
    storeId: null,
    provider: row.provider || 'shopify',
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    customerId: row.customerId,
    subscriptionId: row.subscriptionId,
    shopDomain: row.shopDomain,
    cartsUsedInPeriod: row.cartsUsedInPeriod || 0,
    overageMessages: row.overageMessages || 0,
    cartOverage: row.cartOverage || 0,
    bargainSessionsUsed: row.bargainSessionsUsed || 0,
    bargainDealsUsed: row.bargainDealsUsed || 0,
    bargainOverageDeals: row.bargainOverageDeals || 0,
    revenueShareAccrued: row.revenueShareAccrued || 0,
    revenueSharePaid: row.revenueSharePaid || 0,
    bargainAccrued: row.bargainAccrued || 0,
  }
}

export async function resolveStoreSubscription(
  userId: string,
  storeId?: string | null,
  knownStore?: { id?: string; platform?: string | null } | null,
): Promise<ResolvedStoreSubscription | null> {
  const store = knownStore || await resolveBillingStore(userId, storeId)
  if (store && isWooCommercePlatform(store.platform)) {
    const row = await prisma.razorpaySubscription.findUnique({ where: { storeId: store.id || storeId || '' } })
    if (row) return normalizeRazorpaySubscription(row)
    return resolveOrCreateFreeStoreSubscription(userId, store.id || storeId || '', store)
  }
  const row = await prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return row ? normalizeShopifySubscription(row) : null
}

export async function resolveOrCreateFreeStoreSubscription(
  userId: string,
  storeId: string,
  knownStore?: { id?: string; platform?: string | null } | null,
): Promise<ResolvedStoreSubscription> {
  const store = knownStore || await prisma.store.findFirst({ where: { id: storeId, userId } })
  if (!store) throw new Error('store_not_found')

  const resolvedStoreId = store.id || storeId
  if (isWooCommercePlatform(store.platform)) {
    const existing = await prisma.razorpaySubscription.findUnique({ where: { storeId: resolvedStoreId } })
    if (existing) return normalizeRazorpaySubscription(existing)
    const now = new Date()
    const created = await prisma.razorpaySubscription.upsert({
      where: { storeId: resolvedStoreId },
      update: {},
      create: {
        userId,
        storeId: resolvedStoreId,
        plan: 'free',
        status: 'active',
        billingPeriod: 'monthly',
        amount: 0,
        currency: 'INR',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    return normalizeRazorpaySubscription(created)
  }

  const existing = await prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  if (existing) return normalizeShopifySubscription(existing)
  const now = new Date()
  const created = await prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      customerId: `free_${userId}`,
      plan: 'free',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      smsCredits: 0,
      smsCreditsUsed: 0,
      revenueShareAccrued: 0,
      revenueSharePaid: 0,
    },
  })
  return normalizeShopifySubscription(created)
}

export function mapRazorpayStatus(status: string): string {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'pending':
    case 'created':
      return 'pending'
    case 'halted':
    case 'paused':
      return 'past_due'
    case 'cancelled':
      return 'cancelled'
    case 'expired':
    case 'completed':
      return 'expired'
    default:
      return 'pending'
  }
}

export function meterUpdate(subscription: ResolvedStoreSubscription, data: Record<string, unknown>) {
  const update = data as any
  if (subscription.kind === 'razorpay') {
    return prisma.razorpaySubscription.update({ where: { id: subscription.id }, data: update })
  }
  return prisma.subscription.update({ where: { id: subscription.id }, data: update })
}
