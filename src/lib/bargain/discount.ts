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
  customerEmail?: string
  cartToken?: string
}

// Shopify `customerSelection` for a discount.
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
    return {
      code,
      status: 'pending',
      error: 'Shopify not connected — code stored pending sync',
    }
  }

  const ONE_DAY = 24 * 60 * 60
  const startsAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + ONE_DAY * 1000).toISOString()

  const variantGid = variantId ? `gid://shopify/ProductVariant/${variantId}` : null
  const productGid = shopifyProductId ? `gid://shopify/Product/${shopifyProductId}` : null

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `

  const discountValue = {
    percentage: discountPercent,
  }

  const basicCodeDiscount: any = {
    title: `Bargain ${code}`,
    code,
    startsAt,
    endsAt: expiresAt,
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection: buildCustomerSelection(opts.shopifyCustomerId),
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: false },
    value: discountValue,
    customerGets: {
      value: discountValue,
      items: scope === 'order' ? { all: true } : {},
    },
    minimumSubtotal,
  }

  if (scope === 'product' && productGid) {
    basicCodeDiscount.customerGets.items = { products: { productsToAdd: [productGid] } }
  } else if (scope === 'variant' && variantGid) {
    basicCodeDiscount.customerGets.items = { productVariants: { productsToAdd: [variantGid] } }
  } else {
    basicCodeDiscount.customerGets.items = { all: true }
  }

  const variables = {
    basicCodeDiscount,
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
    const createdCode = data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code || code
    return {
      code: createdCode,
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
