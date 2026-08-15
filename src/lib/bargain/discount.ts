import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
import { getAccessToken } from '@/lib/shopify'

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

export type GeneratedBargainDiscount = {
  code: string
  status: 'created' | 'pending' | 'failed'
  error?: string
}

/**
 * Create a Shopify discountCodeBasic for an accepted bargain.
 * - Usage limit: 1
 * - 24h expiry
 * - scope 'product' | 'variant': applies to specific product/variant with
 *   `percentage` off the original price, bringing the customer to `finalPrice`.
 * - scope 'order' (default when no product given): applies percentage off the
 *   whole order — used by the Thank-you "next order" bargain.
 */
export async function generateBargainDiscountCode(opts: {
  store: Store
  shopifyProductId?: string | null
  variantId?: string | null
  originalPrice: number
  finalPrice: number
  discountPercent: number
  code: string
}): Promise<GeneratedBargainDiscount> {
  const { store, shopifyProductId, variantId, originalPrice, finalPrice, discountPercent, code } = opts
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
    // Not Shopify-connected — code stored locally, merchant can sync later
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
      customerSelection: { all: true },
      eligibleProducts: scope === 'product' ? { productsV2: { productsToAdd: [productGid!] } } : undefined,
      variants: scope === 'variant' ? { productVariantsToAdd: [variantGid!] } : undefined,
      value: {
        percentage: discountPercent,
      },
      minimumSubtotal: originalPrice,
      summary: `Auto-generated bargain: ${discountPercent}% off (₹${finalPrice.toFixed(2)} from ₹${originalPrice.toFixed(2)})`,
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
    return { code, status: 'created' }
  } catch (err: any) {
    return {
      code,
      status: 'failed',
      error: err?.message || 'Shopify GraphQL request failed',
    }
  }
}
