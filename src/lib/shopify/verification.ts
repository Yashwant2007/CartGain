import { shopifyGraphQL } from '@/lib/shopify'
import { verifyShopifyDiscountCode } from '@/lib/shopify/discount'
import { SHOPIFY_OAUTH_SCOPES } from '@/lib/shopify-oauth'

export interface ShopifyVerificationStoreRef {
  id: string
  domain: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}

export type NormalizedSubscriptionStatus = 'active' | 'pending' | 'paused' | 'cancelled'

export interface NormalizedShopifyVerificationSubscription {
  id: string
  name: string
  status: NormalizedSubscriptionStatus
  rawStatus: string
  currentPeriodEnd: string | null
  createdAt: string | null
  lineItemIds: string[]
}

export interface NormalizedDiscountCodeVerification {
  code: string
  verified: boolean
  discountNodeId: string | null
  endsAt: string | null
}

export interface NormalizedShopifyVerification {
  shop: {
    id: string | null
    name: string | null
    domain: string | null
  }
  appInstallationId: string | null
  requestedScopes: string[]
  grantedScopes: string[]
  missingScopes: string[]
  activeSubscriptions: NormalizedShopifyVerificationSubscription[]
  allSubscriptions: NormalizedShopifyVerificationSubscription[]
  discountCode: NormalizedDiscountCodeVerification | null
}

interface ShopifySubscriptionNode {
  id?: string | null
  name?: string | null
  status?: string | null
  currentPeriodEnd?: string | null
  createdAt?: string | null
  lineItems?: Array<{ id?: string | null }> | null
}

export interface ShopifyVerificationGraphqlData {
  shop?: {
    id?: string | null
    name?: string | null
    myshopifyDomain?: string | null
    domain?: string | null
  } | null
  currentAppInstallation?: {
    id?: string | null
    accessScopes?: Array<{ handle?: string | null }> | null
    activeSubscriptions?: ShopifySubscriptionNode[] | null
    allSubscriptions?: { nodes?: ShopifySubscriptionNode[] | null } | null
  } | null
}

export const SHOPIFY_VERIFICATION_QUERY = `#graphql
  query CartGainShopifyVerification {
    shop {
      id
      name
      myshopifyDomain
    }
    currentAppInstallation {
      id
      accessScopes {
        handle
      }
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          id
        }
      }
      allSubscriptions(first: 10, reverse: true) {
        nodes {
          id
          name
          status
          currentPeriodEnd
          createdAt
        }
      }
    }
  }
`

export function buildShopifyVerificationQuery(): string {
  return SHOPIFY_VERIFICATION_QUERY
}

export function getRequestedShopifyScopes(): string[] {
  return uniqueStrings(SHOPIFY_OAUTH_SCOPES.split(','))
}

export function parseShopifyVerificationData(
  data: ShopifyVerificationGraphqlData | null | undefined,
  options: {
    shopDomain?: string | null
    requestedScopes?: readonly string[]
  } = {},
): NormalizedShopifyVerification {
  const requestedScopes = options.requestedScopes === undefined
    ? getRequestedShopifyScopes()
    : uniqueStrings(options.requestedScopes)
  const installation = data?.currentAppInstallation
  const grantedScopes = uniqueStrings(
    (Array.isArray(installation?.accessScopes) ? installation?.accessScopes : [])
      .map((scope) => asString(scope?.handle))
      .filter((handle): handle is string => Boolean(handle)),
  )
  const granted = new Set(grantedScopes)
  const shopRecord = data?.shop
  const domain = asString(shopRecord?.myshopifyDomain)
    || asString(shopRecord?.domain)
    || asString(options.shopDomain)

  return {
    shop: {
      id: asString(shopRecord?.id),
      name: asString(shopRecord?.name),
      domain,
    },
    appInstallationId: asString(installation?.id),
    requestedScopes,
    grantedScopes,
    missingScopes: requestedScopes.filter((scope) => !granted.has(scope)),
    activeSubscriptions: normalizeSubscriptions(installation?.activeSubscriptions, false),
    allSubscriptions: normalizeSubscriptions(installation?.allSubscriptions?.nodes, true),
    discountCode: null,
  }
}

export async function verifyShopifyInstallation(
  store: ShopifyVerificationStoreRef,
  options: {
    code?: string | null
    requestedScopes?: readonly string[]
  } = {},
): Promise<NormalizedShopifyVerification> {
  const data = await shopifyGraphQL<ShopifyVerificationGraphqlData>(
    store,
    buildShopifyVerificationQuery(),
    {},
    10000,
  )
  const result = parseShopifyVerificationData(data, {
    shopDomain: store.domain,
    ...(options.requestedScopes === undefined ? {} : { requestedScopes: options.requestedScopes }),
  })
  const code = asString(options.code)?.trim()

  if (!code) return result

  const lookup = await verifyShopifyDiscountCode({ store, code })
  result.discountCode = {
    code,
    verified: lookup.verified,
    discountNodeId: asString(lookup.discountNodeId),
    endsAt: asString(lookup.endsAt),
  }
  return result
}

function normalizeSubscriptions(
  nodes: readonly ShopifySubscriptionNode[] | null | undefined,
  withoutLineItems: boolean,
): NormalizedShopifyVerificationSubscription[] {
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    const rawStatus = asString(node?.status) || ''
    const lineItemIds = withoutLineItems
      ? []
      : (Array.isArray(node?.lineItems) ? node.lineItems : [])
        .map((lineItem) => asString(lineItem?.id))
        .filter((id): id is string => Boolean(id))

    return {
      id: asString(node?.id) || '',
      name: asString(node?.name) || '',
      status: normalizeSubscriptionStatus(rawStatus),
      rawStatus: rawStatus.toUpperCase(),
      currentPeriodEnd: toIsoString(node?.currentPeriodEnd),
      createdAt: toIsoString(node?.createdAt),
      lineItemIds,
    }
  })
}

function normalizeSubscriptionStatus(rawStatus: string): NormalizedSubscriptionStatus {
  switch (rawStatus.toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PENDING':
      return 'pending'
    case 'FROZEN':
      return 'paused'
    default:
      return 'cancelled'
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)))
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toIsoString(value: unknown): string | null {
  if (value == null || value === '') return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
