import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
import { getAccessToken } from '@/lib/shopify'
import { exactPercentOff, toMinorUnits, fromMinorUnits, isAtOrAboveFloor } from '@/lib/financial-safety'

// regenerate types for safety
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

// Discount code with (optional) customer binding to reduce sharing.
export type GeneratedBargainDiscount = {
  code: string
  status: 'created' | 'pending' | 'failed'
  error?: string
  // Customer binding: if set, the code can only be used by this customer
  customerEmail?: string
  cartToken?: string
}

// Shopify `customerSelection` for a discount. When we hold a Shopify customer id
// we bind the code to that customer so a shared screenshot cannot be redeemed by
// anyone else. Without a customer identity we can only scope it to "all
// customers" — the code is still single-use globally (usageLimit 1,
// appliesOncePerCustomer true), but it is NOT customer-bound, so treat it as
// confidential rather than shareable.
export function buildCustomerSelection(
  shopifyCustomerId?: string | null,
): { all: true } | { customers: { add: string[] } } {
  const id = shopifyCustomerId?.trim()
  if (id) {
    const gid = id.startsWith('gid://') ? id : `gid://shopify/Customer/${id}`
    return { customers: { add: [gid] } }
  }
  return { all: true }
}

/**
 * Create a Shopify discountCodeBasic for an accepted bargain.
 * - Usage limit: 1 (globally, per Shopify)
 * - 24h expiry
 * - scope 'product' | 'variant': applies to specific product/variant with
 *   `percentage` off the original price, bringing the customer to `finalPrice`.
 * - scope 'order' (default when no product given): applies percentage off the
 *   whole order — used by the Thank-you "next order" bargain.
 * - CRITICAL — FINANCIAL SAFETY (see src/lib/financial-safety.ts):
 *   The discount percent is the EXACT percent derived from
 *   (originalPrice, finalPrice, floorPrice) in integer minor units. It is never
 *   rounded to an integer (integer rounding could drop the charged price below
 *   the merchant floor). The `minimumSubtotal` is bound to
 *   `originalPrice * bulkQuantity` so a bulk-negotiated per-unit price CANNOT be
 *   applied to a 1-unit purchase below the single-unit floor.
 * - Customer binding: when `shopifyCustomerId` is supplied the code is bound to
 *   that customer (only they can redeem it). Otherwise it is single-use globally
 *   but not customer-bound — see buildCustomerSelection.
 */
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
  const { store, shopifyProductId, variantId, originalPrice, finalPrice, code, customerEmail, cartToken } = opts
  const bulkQuantity = Math.max(1, Math.floor(opts.bulkQuantity ?? 1))

  // Re-derive the percent and re-verify the floor in minor units — the discount
  // generator NEVER trusts a rounded percent from the caller.
  const discountPercent = exactPercentOff(originalPrice, finalPrice)
  const floorMinor = toMinorUnits(opts.floorPrice ?? 0)
  if (opts.floorPrice != null && floorMinor > 0) {
    const chargeMinor = Math.round(toMinorUnits(originalPrice) * (1 - discountPercent / 100))
    if (!isAtOrAboveFloor(chargeMinor, floorMinor)) {
      return { code, status: 'failed', error: 'Discount would breach merchant floor' }
    }
  }
  const minimumSubtotal = fromMinorUnits(toMinorUnits(originalPrice) * bulkQuantity)

  const scope: 'order' | 'product' | 'variant' = variantId
    ? 'variant'
    : shopifyProductId
      ? 'product'
      : 'order'

  // Shop domain must be `<shop>.myshopify.com` for GraphQL API
  const shopDomain = store.domain.includes('.')
    ? store.domain
    : `${store.domain}.myshopify.com`

  let accessToken: string | null = null
  try {
    accessToken = await getAccessToken(store)
  } catch (err) {
    return {
      code,
      status: 'failed',
      error: 'Could not retrieve Shopify access token',
    }
  }

  if (!accessToken) {
    // Not Shopify-connected — code stored locally, merchant can sync later.
    // Return the code UNCHANGED: never append the customer identity to it (that
    // produced bogus codes like `CG-ABC:me@x.com:` that no checkout could use).
    return {
      code,
      status: 'pending',
      error: 'Shopify not connected — code stored pending sync',
    }
  }

  // GraphQL discountCodeBasicCreate mutation (Customer-facing Shopify admin)
  // Note: requires `write_discounts` access scope on the merchant's app.
  const ONE_DAY = 24 * 60 * 60
  const startsAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + ONE_DAY * 1000).toISOString()

  const variantGid = variantId ? `gid://shopify/ProductVariant/${variantId}` : null
  const productGid = shopifyProductId ? `gid://shopify/Product/${shopifyProductId}` : null

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) {
              edges { node { code } }
            }
          }
        }
        userErrors { field message }
      }
    }
  `

  const variables = {
    basicCodeDiscount: {
      title: `Bargain ${code}`,
      code,
      startsAt,
      endsAt: expiresAt,
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: buildCustomerSelection(opts.shopifyCustomerId),
      eligibleProducts: scope === 'product' ? { productsV2: { productsToAdd: [productGid!] } } : undefined,
      variants: scope === 'variant' ? { productVariantsToAdd: [variantGid!] } : undefined,
      value: {
        percentage: discountPercent,
      },
      // FINANCIAL SAFETY: min subtotal bound to the negotiated quantity so a
      // bulk-negotiated unit price can't be applied to a smaller basket.
      minimumSubtotal,
      summary: `Bargain deal: ${discountPercent}% off (${store.currency} ${finalPrice.toFixed(2)} from ${store.currency} ${originalPrice.toFixed(2)})`,
    },
  }

  try {
    const data = await queryShopifyGraphQL<any>(
      shopDomain,
      accessToken,
      mutation,
      variables
    )
    const userErrors = data?.discountCodeBasicCreate?.userErrors
    if (userErrors && userErrors.length > 0) {
      return {
        code,
        status: 'failed',
        error: userErrors[0].message || 'Shopify rejected the discount code',
      }
    }
    // Customer binding is applied via customerSelection above (when we hold a
    // Shopify customer id). There is no additional metafield step — Shopify has
    // no supported metafield that restricts a code to an email/cart token, so we
    // do not pretend otherwise.
    return {
      code,
      status: 'created',
      ...(customerEmail ? { customerEmail } : {}),
      ...(cartToken ? { cartToken } : {}),
    }
  } catch (err: any) {
    return {
      code,
      status: 'failed',
      error: err?.message || 'Shopify GraphQL request failed',
    }
  }
}
