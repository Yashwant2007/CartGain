export const CHECKOUT_OPEN_RATE_KEY = 'bargain_checkout_open_'
export const CHECKOUT_ACCEPT_RATE_KEY = 'bargain_checkout_accept_'

export interface BargainBuyerIdentity {
  customerFingerprint?: string | null
  customerEmail?: string | null
  cartToken?: string | null
  customerPhone?: string | null
  customerId?: string | null
}

export interface CheckoutLockSession {
  checkoutOpenedAt: Date | null
  checkoutPurchaseAt?: Date | null
}

export interface PurchaseMemory {
  shopifyOrderId: string
  productTitle?: string | null
  shopifyProductId?: string | null
  variantId?: string | null
  price?: number | null
  currency?: string | null
  purchasedAt: Date
}

export function bargainSessionIdentityClauses(identity: BargainBuyerIdentity): Array<Record<string, string>> {
  return [
    ...(identity.customerFingerprint ? [{ customerFingerprint: identity.customerFingerprint }] : []),
    ...(identity.cartToken ? [{ cartToken: identity.cartToken }] : []),
    ...(identity.customerEmail ? [{ customerEmail: identity.customerEmail }] : []),
    ...(identity.customerPhone ? [{ customerPhone: identity.customerPhone }] : []),
  ]
}

export function strongSessionIdentityClauses(identity: BargainBuyerIdentity): Array<Record<string, string>> {
  return [
    ...(identity.customerFingerprint ? [{ customerFingerprint: identity.customerFingerprint }] : []),
    ...(identity.cartToken ? [{ cartToken: identity.cartToken }] : []),
  ]
}

export function purchaseMemoryIdentityClauses(identity: BargainBuyerIdentity): Array<Record<string, string>> {
  return [
    ...(identity.customerEmail ? [{ customerEmail: identity.customerEmail }] : []),
    ...(identity.cartToken ? [{ cartToken: identity.cartToken }] : []),
    ...(identity.customerPhone ? [{ customerPhone: identity.customerPhone }] : []),
    ...(identity.customerId ? [{ customerId: identity.customerId }] : []),
  ]
}

export interface SessionProofTarget {
  id?: string | null
  customerFingerprint?: string | null
  cartToken?: string | null
}

export interface CallerStrongProof {
  customerFingerprint?: string | null
  cartToken?: string | null
  tokenSessionId?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
}

export function hasStrongBuyerProof(caller: CallerStrongProof): boolean {
  return Boolean(caller.customerFingerprint || caller.cartToken || caller.tokenSessionId)
}

export function hasStrongProofForSession(
  session: SessionProofTarget,
  caller: CallerStrongProof,
): boolean {
  return (
    (!!session.customerFingerprint && caller.customerFingerprint === session.customerFingerprint) ||
    (!!session.cartToken && caller.cartToken === session.cartToken) ||
    (!!caller.tokenSessionId && !!session.id && caller.tokenSessionId === session.id)
  )
}

export function hasPurchaseSince(purchases: Array<{ purchasedAt: Date }>, since: Date): boolean {
  const from = since.getTime()
  return purchases.some((purchase) => purchase.purchasedAt.getTime() > from)
}

export function isCheckoutLocked(
  session: CheckoutLockSession,
  purchases: Array<{ purchasedAt: Date }> = [],
): boolean {
  if (!session.checkoutOpenedAt) return false
  const since = session.checkoutOpenedAt.getTime()
  if (session.checkoutPurchaseAt && session.checkoutPurchaseAt.getTime() > since) return false
  return !hasPurchaseSince(purchases, session.checkoutOpenedAt)
}

export function latestPurchase(purchases: PurchaseMemory[]): PurchaseMemory | null {
  if (purchases.length === 0) return null
  return purchases.reduce((best, current) =>
    current.purchasedAt.getTime() > best.purchasedAt.getTime() ? current : best,
  )
}

export function purchaseDisplayName(purchase: PurchaseMemory): string {
  if (purchase.productTitle?.trim()) return purchase.productTitle.trim()
  if (purchase.shopifyProductId) {
    const numeric = purchase.shopifyProductId.replace(/^gid:\/\/shopify\/Product\//, '')
    return `Product ${numeric}`
  }
  return 'your last order'
}
