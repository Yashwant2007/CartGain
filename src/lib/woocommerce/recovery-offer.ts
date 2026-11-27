import {
  buildWooCommerceCheckoutUrl,
  createOrReuseWooCommerceCoupon,
} from '@/lib/woocommerce/bargain-adapter'

export type WooCommerceRecoveryCouponInput = {
  store: any
  code: string
  value: number
  type: 'percentage' | 'fixed'
  cartTotal?: number | null
  cartId?: string
  productIds?: string[]
}

export async function resolveWooCommerceRecoveryCoupon(opts: WooCommerceRecoveryCouponInput) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const result = await createOrReuseWooCommerceCoupon({
    store: opts.store,
    code: opts.code,
    value: opts.value,
    type: opts.type,
    minimumSubtotal: opts.cartTotal ?? null,
    expiresAt,
    description: `CartGain recovery ${opts.code}`,
    productIds: opts.productIds,
  })
  if (!result) return null
  return {
    code: result.code,
    source: 'minted' as const,
    purchaseUrl:
      result.purchaseUrl ||
      buildWooCommerceCheckoutUrl({ domain: opts.store.domain, code: result.code }),
  }
}
