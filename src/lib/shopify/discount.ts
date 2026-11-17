import { getAccessToken } from '@/lib/shopify'
import { queryShopifyGraphQL } from '@/lib/shopify-graphql'

export type DiscountTarget =
  | { scope: 'order' }
  | { scope: 'product'; productGids: string[] }
  | { scope: 'variant'; variantGids: string[] }

export type DiscountValueSpec =
  | { kind: 'percentage'; percentage: number }
  | { kind: 'fixed'; amount: number }

export type CreateShopifyDiscountInput = {
  store: any
  code: string
  title: string
  value: DiscountValueSpec
  target: DiscountTarget
  startsAt?: Date | string
  endsAt?: Date | string
  minimumSubtotal?: number | null
  shopifyCustomerId?: string | null
  usageLimit?: number | null
  appliesOncePerCustomer?: boolean
}

export type ShopifyDiscountResult = {
  code: string
  status: 'created' | 'pending' | 'failed'
  error?: string
  discountNodeId?: string
  endsAt?: string
  verified: boolean
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Normalize a numeric id or an existing Shopify GID to one GID type. */
export function toShopifyGid(type: 'Product' | 'ProductVariant' | 'Customer', raw?: string | null): string | null {
  if (!raw) return null
  const value = String(raw).trim()
  if (!value) return null
  const prefix = `gid://shopify/${type}/`
  if (value.startsWith(prefix)) return value
  if (value.startsWith('gid://shopify/')) return null
  return `${prefix}${value}`
}

/** Resolve callers that send a ProductVariant GID in a product-id field. */
export function resolveDiscountTarget(opts: {
  productId?: string | null
  variantId?: string | null
}): DiscountTarget {
  const variantGid = toShopifyGid('ProductVariant', opts.variantId)
  if (variantGid) return { scope: 'variant', variantGids: [variantGid] }

  const rawProduct = opts.productId?.trim() || ''
  if (rawProduct.startsWith('gid://shopify/ProductVariant/')) {
    return { scope: 'variant', variantGids: [rawProduct] }
  }
  const productGid = toShopifyGid('Product', rawProduct || null)
  if (productGid) return { scope: 'product', productGids: [productGid] }
  return { scope: 'order' }
}

export function buildDiscountContext(shopifyCustomerId?: string | null): Record<string, unknown> {
  const customerGid = toShopifyGid('Customer', shopifyCustomerId)
  if (!customerGid) return { all: 'ALL' }
  return { customers: { add: [customerGid] } }
}

export function buildDiscountItems(target: DiscountTarget): Record<string, unknown> {
  if (target.scope === 'product' && target.productGids.length) {
    return { products: { productsToAdd: Array.from(new Set(target.productGids)) } }
  }
  if (target.scope === 'variant' && target.variantGids.length) {
    return { products: { productVariantsToAdd: Array.from(new Set(target.variantGids)) } }
  }
  return { all: true }
}

export function buildDiscountValue(value: DiscountValueSpec): Record<string, unknown> {
  if (value.kind === 'percentage') {
    const percentage = Number.isFinite(value.percentage) ? value.percentage : 0
    return { percentage: Math.round(Math.min(100, Math.max(0, percentage)) * 1_000_000) / 100_000_000 }
  }
  const amount = Number.isFinite(value.amount) ? value.amount : 0
  return {
    discountAmount: {
      amount: amount.toFixed(2),
      appliesOnEachItem: false,
    },
  }
}

/**
 * Shopify 2026-04 DiscountCodeBasicInput. Value, eligibility and minimum
 * requirement are nested; the old top-level `value`, `minimumSubtotal` and
 * `customerGets.items.productVariants` fields are not valid in this API.
 */
export function buildBasicCodeDiscount(input: CreateShopifyDiscountInput): Record<string, unknown> {
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
  const endsAt = input.endsAt
    ? new Date(input.endsAt)
    : new Date(startsAt.getTime() + ONE_DAY_MS)
  const basic: Record<string, unknown> = {
    title: input.title,
    code: input.code,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    context: buildDiscountContext(input.shopifyCustomerId),
    customerGets: {
      value: buildDiscountValue(input.value),
      items: buildDiscountItems(input.target),
    },
    usageLimit: input.usageLimit ?? 1,
    appliesOncePerCustomer: input.appliesOncePerCustomer ?? true,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: true,
      shippingDiscounts: false,
    },
  }
  if (input.minimumSubtotal != null && Number.isFinite(input.minimumSubtotal) && input.minimumSubtotal > 0) {
    basic.minimumRequirement = {
      subtotal: { greaterThanOrEqualToSubtotal: input.minimumSubtotal.toFixed(2) },
    }
  }
  return basic
}

const CREATE_MUTATION = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            status
            endsAt
            usageLimit
            codes(first: 5) { nodes { code } }
          }
        }
      }
      userErrors { field message code extraInfo }
    }
  }
`

const LOOKUP_QUERY = `
  query discountCodeLookup($query: String!) {
    codeDiscountNodes(query: $query, first: 5) {
      nodes {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            status
            endsAt
            usageLimit
            codes(first: 5) { nodes { code } }
          }
        }
      }
    }
  }
`

function activeNode(node: any, code: string): boolean {
  const discount = node?.codeDiscount
  if (!discount) return false
  if (discount.status !== 'ACTIVE' && discount.status !== 'SCHEDULED') return false
  if (discount.endsAt && new Date(discount.endsAt).getTime() <= Date.now()) return false
  const codes: string[] = discount.codes?.nodes?.map((entry: any) => entry?.code) ?? []
  return codes.includes(code)
}

/** Verify a code through the Admin API. Fail closed when readback is unavailable. */
export async function verifyShopifyDiscountCode(opts: {
  store: any
  code: string
}): Promise<{ verified: boolean; discountNodeId?: string; endsAt?: string }> {
  let token: string | null = null
  try {
    token = await getAccessToken(opts.store)
  } catch {
    return { verified: false }
  }
  if (!token) return { verified: false }
  const shop = String(opts.store.domain || '').includes('.')
    ? opts.store.domain
    : `${opts.store.domain}.myshopify.com`
  try {
    const data = await queryShopifyGraphQL<any>(shop, token, LOOKUP_QUERY, { query: opts.code })
    const nodes = data?.codeDiscountNodes?.nodes ?? []
    const match = nodes.find((node: any) => activeNode(node, opts.code))
    if (!match) return { verified: false }
    return {
      verified: true,
      discountNodeId: match.id,
      endsAt: match.codeDiscount?.endsAt ?? undefined,
    }
  } catch {
    return { verified: false }
  }
}

function isAlreadyExistsError(errors: Array<{ message?: string; code?: string }>): boolean {
  return errors.some((error) => {
    const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
    return text.includes('already') || text.includes('taken') || text.includes('duplicate')
  })
}

export async function createShopifyDiscountCode(
  input: CreateShopifyDiscountInput
): Promise<ShopifyDiscountResult> {
  let token: string | null = null
  try {
    token = await getAccessToken(input.store)
  } catch {
    return { code: input.code, status: 'failed', error: 'Could not retrieve Shopify access token', verified: false }
  }
  if (!token) {
    return { code: input.code, status: 'pending', error: 'Shopify not connected', verified: false }
  }

  const shop = String(input.store.domain || '').includes('.')
    ? input.store.domain
    : `${input.store.domain}.myshopify.com`
  const basicCodeDiscount = buildBasicCodeDiscount(input)

  try {
    const data = await queryShopifyGraphQL<any>(shop, token, CREATE_MUTATION, { basicCodeDiscount })
    const errors: Array<{ field?: string[]; message?: string; code?: string }> =
      data?.discountCodeBasicCreate?.userErrors ?? []
    if (errors.length) {
      // The mutation can succeed while the HTTP response is lost. Reconcile by
      // code before deciding this is a genuine failure; never mint a second code.
      if (isAlreadyExistsError(errors)) {
        const existing = await verifyShopifyDiscountCode({ store: input.store, code: input.code })
        if (existing.verified) {
          return {
            code: input.code,
            status: 'created',
            verified: true,
            ...(existing.discountNodeId ? { discountNodeId: existing.discountNodeId } : {}),
            ...(existing.endsAt ? { endsAt: existing.endsAt } : {}),
          }
        }
      }
      return {
        code: input.code,
        status: 'failed',
        verified: false,
        error: errors[0]?.message || 'Shopify rejected the discount code',
      }
    }

    const node = data?.discountCodeBasicCreate?.codeDiscountNode
    const discount = node?.codeDiscount
    if (!node || !activeNode({ codeDiscount: discount }, input.code)) {
      return {
        code: input.code,
        status: 'failed',
        verified: false,
        error: 'Shopify did not confirm an active discount code',
      }
    }
    return {
      code: input.code,
      status: 'created',
      verified: true,
      discountNodeId: node.id,
      ...(discount?.endsAt ? { endsAt: discount.endsAt } : {}),
    }
  } catch (error: any) {
    return {
      code: input.code,
      status: 'failed',
      verified: false,
      error: error?.message || 'Shopify GraphQL request failed',
    }
  }
}

export function friendlyDiscountError(message?: string | null): string {
  const text = (message || '').toLowerCase()
  if (text.includes('permission') || text.includes('access') || text.includes('scope')) {
    return "We've secured your agreed deal. We're having trouble preparing the checkout code. Please try again."
  }
  if (text.includes('expired')) {
    return "That offer has expired. Let's try again."
  }
  return "Your offer couldn't be confirmed. Let's try again."
}
