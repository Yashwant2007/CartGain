import { shopifyGraphQL, assertNoUserErrors, type ShopifyStoreRef, type UserError } from './client'
import type { BillingCurrency, BillingPeriod } from './plans'

/**
 * Shopify Billing is the merchant-of-record layer for App Store installs. Every
 * financial value here is derived server-side from PLANS / the shop currency —
 * the browser can never pass an amount.
 *
 * Test mode: set SHOPIFY_BILLING_TEST=true on non-production deployments so
 * Shopify issues test charges and dev stores are never really billed.
 */
export function shopifyBillingTestMode(): boolean {
  return process.env.SHOPIFY_BILLING_TEST === 'true'
}

export type NormalizedShopifyStatus = 'active' | 'pending' | 'paused' | 'cancelled'

/** Map Shopify's AppSubscriptionStatus onto the statuses the app already gates on. */
export function mapShopifyStatus(rawStatus: string | null | undefined): NormalizedShopifyStatus {
  switch (String(rawStatus || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PENDING':
      return 'pending'
    case 'FROZEN':
      return 'paused'
    case 'CANCELLED':
    case 'DECLINED':
    case 'EXPIRED':
    default:
      return 'cancelled'
  }
}

export interface NormalizedShopifySubscription {
  id: string
  name: string
  status: NormalizedShopifyStatus
  rawStatus: string
  currentPeriodEnd: Date | null
  lineItemId: string | null
}

interface ActiveSubscriptionQuery {
  currentAppInstallation: {
    id: string
    activeSubscriptions: Array<{
      id: string
      name: string
      status: string
      currentPeriodEnd: string | null
      lineItems: Array<{
        id: string
        plan: {
          pricingDetails:
            | { __typename: 'AppRecurringPricing' }
            | { __typename: 'AppUsagePricing'; terms?: string | null }
        }
      }>
    }>
  } | null
}

const ACTIVE_SUBSCRIPTION_QUERY = /* GraphQL */ `
  query CartGainActiveSubscription {
    currentAppInstallation {
      id
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing { interval price { amount currencyCode } }
              ... on AppUsagePricing { terms cappedAmount { amount currencyCode } }
            }
          }
        }
      }
    }
  }
`

/**
 * The shop's active app subscription, normalized. Returns null when the shop
 * has no active subscription (never approved, cancelled, expired, declined).
 */
export async function getActiveShopifySubscription(
  store: ShopifyStoreRef,
): Promise<NormalizedShopifySubscription | null> {
  const { data, errors } = await shopifyGraphQL<ActiveSubscriptionQuery>(store, ACTIVE_SUBSCRIPTION_QUERY)
  if (errors.length || !data) return null

  const subscriptions = data.currentAppInstallation?.activeSubscriptions || []
  if (subscriptions.length === 0) return null

  // Prefer an ACTIVE subscription; fall back to the first (e.g. PENDING during
  // the approval handshake) so callers can still reconcile pending state.
  const chosen = subscriptions.find((s) => String(s.status).toUpperCase() === 'ACTIVE') || subscriptions[0]

  const usageLine = chosen.lineItems.find((li) => li.plan?.pricingDetails?.__typename === 'AppUsagePricing')

  return {
    id: chosen.id,
    name: chosen.name,
    status: mapShopifyStatus(chosen.status),
    rawStatus: String(chosen.status).toUpperCase(),
    currentPeriodEnd: chosen.currentPeriodEnd ? new Date(chosen.currentPeriodEnd) : null,
    lineItemId: usageLine?.id || null,
  }
}

export interface CreateShopifySubscriptionParams {
  store: ShopifyStoreRef
  planName: string
  amount: number
  currency: BillingCurrency
  period: BillingPeriod
  returnUrl: string
  /** Usage charge ceiling (revenue share). 0 / undefined omits the usage line item. */
  usageCap?: number
  usageTerms?: string
  trialDays?: number
}

export interface CreatedShopifySubscription {
  shopifySubscriptionId: string
  confirmationUrl: string
}

const CREATE_SUBSCRIPTION_MUTATION = /* GraphQL */ `
  mutation CartGainAppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $trialDays: Int
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      lineItems: $lineItems
    ) {
      confirmationUrl
      appSubscription { id status }
      userErrors { field message }
    }
  }
`

interface CreateSubscriptionResponse {
  appSubscriptionCreate: {
    confirmationUrl: string | null
    appSubscription: { id: string; status: string } | null
    userErrors: UserError[]
  }
}

export async function createShopifySubscription(
  params: CreateShopifySubscriptionParams,
): Promise<CreatedShopifySubscription> {
  const { store, planName, amount, currency, period, returnUrl, usageCap, usageTerms, trialDays } = params

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid subscription amount')
  }

  const interval = period === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS'

  const lineItems: Array<Record<string, unknown>> = [
    {
      plan: {
        appRecurringPricingDetails: {
          price: { amount: amount.toFixed(2), currencyCode: currency },
          interval,
        },
      },
    },
  ]

  if (usageCap && usageCap > 0) {
    lineItems.push({
      plan: {
        appUsagePricingDetails: {
          terms: usageTerms || 'Revenue share on recovered sales',
          cappedAmount: { amount: usageCap.toFixed(2), currencyCode: currency },
        },
      },
    })
  }

  const { data, errors } = await shopifyGraphQL<CreateSubscriptionResponse>(
    store,
    CREATE_SUBSCRIPTION_MUTATION,
    {
      name: planName,
      returnUrl,
      test: shopifyBillingTestMode(),
      trialDays: trialDays && trialDays > 0 ? trialDays : null,
      lineItems,
    },
  )

  if (errors.length || !data) {
    throw new Error(errors[0] || 'Shopify did not create the subscription.')
  }

  assertNoUserErrors(data.appSubscriptionCreate.userErrors, 'Shopify declined the subscription')

  const created = data.appSubscriptionCreate.appSubscription
  const confirmationUrl = data.appSubscriptionCreate.confirmationUrl
  if (!created?.id || !confirmationUrl) {
    throw new Error('Shopify did not return a confirmation URL.')
  }

  return { shopifySubscriptionId: created.id, confirmationUrl }
}

const CANCEL_SUBSCRIPTION_MUTATION = /* GraphQL */ `
  mutation CartGainAppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`

interface CancelSubscriptionResponse {
  appSubscriptionCancel: {
    appSubscription: { id: string; status: string } | null
    userErrors: UserError[]
  }
}

/**
 * Cancel the shop's app subscription at Shopify. Returns true when Shopify
 * confirms cancellation (or the subscription is already gone/inactive), false
 * when it could not be confirmed — callers must NOT downgrade the local plan on
 * false, or a merchant could keep getting charged while the app says "free".
 */
export async function cancelShopifySubscription(
  store: ShopifyStoreRef,
  shopifySubscriptionId: string,
): Promise<boolean> {
  if (!shopifySubscriptionId) return true

  const { data, errors } = await shopifyGraphQL<CancelSubscriptionResponse>(
    store,
    CANCEL_SUBSCRIPTION_MUTATION,
    { id: shopifySubscriptionId },
  )

  if (errors.length || !data) return false

  const { userErrors, appSubscription } = data.appSubscriptionCancel
  if (userErrors?.length) {
    // Already cancelled / not cancellable → the merchant won't be charged again.
    const alreadyGone = userErrors.some((e) => /not.*(active|cancel)|does not exist/i.test(e.message || ''))
    if (alreadyGone) return true
    return false
  }

  const status = String(appSubscription?.status || '').toUpperCase()
  return status === 'CANCELLED' || status === 'EXPIRED'
}

export interface UsageRecordResult {
  ok: boolean
  error?: string
  usageRecordId?: string
}

const RECORD_USAGE_MUTATION = /* GraphQL */ `
  mutation CartGainAppUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $price: MoneyInput!
    $description: String!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
      idempotencyKey: $idempotencyKey
    ) {
      appUsageRecord { id }
      userErrors { field message }
    }
  }
`

interface RecordUsageResponse {
  appUsageRecordCreate: {
    appUsageRecord: { id: string } | null
    userErrors: UserError[]
  }
}

/**
 * Record a revenue-share / overage usage charge against the subscription's
 * usage line item. Shopify enforces the capped amount the merchant approved and
 * makes redelivery with the same idempotencyKey a no-op.
 */
export async function recordShopifyUsage(params: {
  store: ShopifyStoreRef
  lineItemId: string
  amount: number
  currency: BillingCurrency
  description: string
  idempotencyKey: string
}): Promise<UsageRecordResult> {
  const { store, lineItemId, amount, currency, description, idempotencyKey } = params

  if (!lineItemId) return { ok: false, error: 'No usage line item on the subscription' }
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Invalid usage amount' }

  const { data, errors } = await shopifyGraphQL<RecordUsageResponse>(store, RECORD_USAGE_MUTATION, {
    subscriptionLineItemId: lineItemId,
    price: { amount: amount.toFixed(2), currencyCode: currency },
    description,
    idempotencyKey,
  })

  if (errors.length || !data) return { ok: false, error: errors[0] || 'Shopify usage record failed' }

  const { userErrors, appUsageRecord } = data.appUsageRecordCreate
  if (userErrors?.length) {
    return { ok: false, error: userErrors.map((e) => e.message).filter(Boolean).join('; ') }
  }

  return { ok: true, usageRecordId: appUsageRecord?.id }
}
