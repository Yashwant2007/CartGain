import {
  buildBasicCodeDiscount,
  createShopifyDiscountCode,
  type DiscountTarget,
  friendlyDiscountError,
  resolveDiscountTarget,
  toShopifyGid,
} from '@/lib/shopify/discount'
import {
  chargedUnitPriceMinor,
  exactPercentOff,
  fromMinorUnits,
  isAtOrAboveFloor,
  toMinorUnits,
} from '@/lib/financial-safety'

type Store = {
  id: string
  name: string
  domain: string
  currency: string
  platform: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}

export type GeneratedBargainDiscount = {
  code: string
  status: 'created' | 'pending' | 'failed'
  error?: string
  customerEmail?: string
  cartToken?: string
  discountNodeId?: string
  endsAt?: string
  verified: boolean
}

/**
 * Kept for older callers/tests. Shopify 2026-04 uses `context`, not the
 * deprecated `customerSelection`; the create helper converts this shape.
 */
export function buildCustomerSelection(
  shopifyCustomerId?: string | null
): { all: true } | { customers: { add: string[] } } {
  const gid = toShopifyGid('Customer', shopifyCustomerId)
  if (gid) return { customers: { add: [gid] } }
  return { all: true }
}

/** Create a verified Shopify basic code for an accepted bargain. */
export async function generateBargainDiscountCode(opts: {
  store: Store
  shopifyProductId?: string | null
  variantId?: string | null
  originalPrice: number
  finalPrice: number
  discountPercent: number
  code: string
  customerEmail?: string | null
  cartToken?: string | null
  bulkQuantity?: number | null
  floorPrice?: number | null
  shopifyCustomerId?: string | null
}): Promise<GeneratedBargainDiscount> {
  const { store, code, customerEmail, cartToken } = opts
  const bulkQuantity = Math.min(100, Math.max(1, Math.floor(opts.bulkQuantity ?? 1)))
  const discountPercent = exactPercentOff(opts.originalPrice, opts.finalPrice)
  const floorMinor = toMinorUnits(opts.floorPrice ?? 0)

  if (opts.floorPrice != null && floorMinor > 0) {
    const chargeMinor = chargedUnitPriceMinor(opts.originalPrice, discountPercent)
    if (!isAtOrAboveFloor(chargeMinor, floorMinor)) {
      return {
        code,
        status: 'failed',
        verified: false,
        error: 'Discount would breach merchant floor',
      }
    }
  }
  if (discountPercent <= 0) {
    return {
      code,
      status: 'failed',
      verified: false,
      error: 'No discount to issue',
    }
  }

  const target = resolveDiscountTarget({
    productId: opts.shopifyProductId,
    variantId: opts.variantId,
  })
  const minimumSubtotal = fromMinorUnits(toMinorUnits(opts.originalPrice) * bulkQuantity)

  const result = await createShopifyDiscountCode({
    store,
    code,
    title: `Bargain ${code}`,
    value: { kind: 'percentage', percentage: discountPercent },
    target,
    minimumSubtotal,
    shopifyCustomerId: opts.shopifyCustomerId,
  })

  return {
    code: result.code,
    status: result.status,
    verified: result.verified,
    ...(result.error ? { error: friendlyDiscountError(result.error) } : {}),
    ...(result.discountNodeId ? { discountNodeId: result.discountNodeId } : {}),
    ...(result.endsAt ? { endsAt: result.endsAt } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(cartToken ? { cartToken } : {}),
  }
}

/**
 * Create a verified Shopify basic code for a multi-product bundle. The caller
 * supplies a floor-safe percentage; eligibility is the bundle product set and
 * the minimum subtotal prevents using the code on a single cheap item.
 */
export async function generateBargainBundleDiscountCode(opts: {
  store: Store
  items: { productId: string; variantId?: string | null }[]
  listTotal: number
  offerTotal: number
  discountPercent: number
  code: string
  customerEmail?: string | null
  cartToken?: string | null
  shopifyCustomerId?: string | null
}): Promise<GeneratedBargainDiscount> {
  const { store, items, code, customerEmail, cartToken } = opts
  const discountPercent = Math.max(0, Math.min(100, Math.round(opts.discountPercent * 100) / 100))
  const productGids = Array.from(
    new Set(
      items
        .map((item) => toShopifyGid('Product', item.productId))
        .filter((gid): gid is string => !!gid)
    )
  )
  if (productGids.length < 2) {
    return { code, status: 'failed', verified: false, error: 'A bundle needs at least two distinct products' }
  }
  if (discountPercent <= 0 || discountPercent >= 100) {
    return { code, status: 'failed', verified: false, error: 'Invalid bundle discount' }
  }

  const result = await createShopifyDiscountCode({
    store,
    code,
    title: `Bargain bundle ${code}`,
    value: { kind: 'percentage', percentage: discountPercent },
    target: { scope: 'product', productGids },
    minimumSubtotal: fromMinorUnits(toMinorUnits(opts.listTotal)),
    shopifyCustomerId: opts.shopifyCustomerId,
  })

  return {
    code: result.code,
    status: result.status,
    verified: result.verified,
    ...(result.error ? { error: friendlyDiscountError(result.error) } : {}),
    ...(result.discountNodeId ? { discountNodeId: result.discountNodeId } : {}),
    ...(result.endsAt ? { endsAt: result.endsAt } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(cartToken ? { cartToken } : {}),
  }
}

export async function generateBargainCartDiscountCode(opts: {
  store: Store
  lines: { productId?: string | null; variantId?: string | null }[]
  listTotal: number
  offerTotal: number
  discountPercent: number
  code: string
  floorTotal?: number | null
  customerEmail?: string | null
  cartToken?: string | null
  shopifyCustomerId?: string | null
}): Promise<GeneratedBargainDiscount> {
  const { store, code, customerEmail, cartToken } = opts
  const discountPercent = Math.max(0, Math.min(100, Math.round(Number(opts.discountPercent) * 100) / 100))
  const listMinor = toMinorUnits(opts.listTotal)
  const offerMinor = toMinorUnits(opts.offerTotal)
  const floorMinor = toMinorUnits(opts.floorTotal ?? 0)
  if (!Number.isFinite(listMinor) || listMinor <= 0 || !Number.isFinite(offerMinor) || offerMinor <= 0) {
    return { code, status: 'failed', verified: false, error: 'Invalid cart discount' }
  }
  if (offerMinor > listMinor || (floorMinor > 0 && offerMinor < floorMinor)) {
    return { code, status: 'failed', verified: false, error: 'Cart discount would breach merchant floor' }
  }
  if (discountPercent <= 0 || discountPercent >= 100) {
    return { code, status: 'failed', verified: false, error: 'Invalid cart discount' }
  }

  const productGids = Array.from(
    new Set(
      opts.lines
        .map((line) => toShopifyGid('Product', line.productId))
        .filter((gid): gid is string => !!gid),
    ),
  )
  const variantGids = Array.from(
    new Set(
      opts.lines
        .map((line) => toShopifyGid('ProductVariant', line.variantId))
        .filter((gid): gid is string => !!gid),
    ),
  )
  const target: DiscountTarget = variantGids.length === opts.lines.length && variantGids.length > 0
    ? { scope: 'variant', variantGids }
    : productGids.length > 0
      ? { scope: 'product', productGids }
      : { scope: 'order' }

  const result = await createShopifyDiscountCode({
    store,
    code,
    title: `Bargain cart ${code}`,
    value: { kind: 'percentage', percentage: discountPercent },
    target,
    minimumSubtotal: fromMinorUnits(listMinor),
    shopifyCustomerId: opts.shopifyCustomerId,
  })

  return {
    code: result.code,
    status: result.status,
    verified: result.verified,
    ...(result.error ? { error: friendlyDiscountError(result.error) } : {}),
    ...(result.discountNodeId ? { discountNodeId: result.discountNodeId } : {}),
    ...(result.endsAt ? { endsAt: result.endsAt } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(cartToken ? { cartToken } : {}),
  }
}

export { buildBasicCodeDiscount }
