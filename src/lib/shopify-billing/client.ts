import {
  getAccessToken,
  assertAllowedShopifyHost,
  ShopifyReconnectRequiredError,
} from '@/lib/shopify'

export { ShopifyReconnectRequiredError }

// Shopify Admin GraphQL API version — kept in sync with the REST calls in
// src/lib/shopify.ts and shopify.app.toml.
export const SHOPIFY_API_VERSION = '2026-04'

const GRAPHQL_TIMEOUT_MS = 15000

export interface ShopifyStoreRef {
  id: string
  domain: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}

export interface GraphQLResult<T> {
  data: T | null
  errors: string[]
}

export function isShopifyAuthFailure(errors: string[]): boolean {
  return errors.some((error) =>
    /HTTP (401|403)|no valid shopify access token|unauthorized|access token/i.test(error),
  )
}

/**
 * Minimal GraphQL Admin API client. Uses the same encrypted/refreshable access
 * token as the REST helpers — no token is ever exposed to the browser or logs.
 * Returns Shopify's userErrors as plain error strings so callers can fail safe.
 */
export async function shopifyGraphQL<T>(
  store: ShopifyStoreRef,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
  const accessToken = await getAccessToken(store)
  if (!accessToken) {
    throw new ShopifyReconnectRequiredError()
  }

  try {
    const url = `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
    assertAllowedShopifyHost(url)
    const headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    }
    const body = JSON.stringify({ query, variables })
    let res = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
      body,
    })

    // Shopify rejected the token — force a refresh once if a refresh token
    // exists, then retry. Legacy non-expiring tokens can never be refreshed,
    // so they surface ShopifyReconnectRequiredError instead of being reused.
    if (res.status === 401 || res.status === 403) {
      if (store.shopifyRefreshToken) {
        const refreshed = await getAccessToken(store, { forceRefresh: true })
        if (refreshed && refreshed !== accessToken) {
          res = await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'X-Shopify-Access-Token': refreshed },
            signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
            body,
          })
        }
      }
      if (res.status === 401 || res.status === 403) {
        throw new ShopifyReconnectRequiredError(
          `Shopify rejected the access token (HTTP ${res.status}). Reconnect the store from Integrations.`,
        )
      }
    }

    if (!res.ok) {
      // 402 = shop frozen; 429 = throttled; other = unexpected.
      return { data: null, errors: [`Shopify GraphQL HTTP ${res.status}`] }
    }

    const json = await res.json().catch(() => null) as
      | { data?: T; errors?: Array<{ message?: string }> }
      | null

    if (!json) return { data: null, errors: ['Shopify returned an unreadable response.'] }
    if (json.errors?.length) {
      return { data: null, errors: json.errors.map((e) => e?.message || 'Shopify GraphQL error') }
    }
    if (!json.data) return { data: null, errors: ['Shopify returned no data.'] }

    return { data: json.data, errors: [] }
  } catch (err: any) {
    if (err instanceof ShopifyReconnectRequiredError) throw err
    const message = err?.name === 'TimeoutError'
      ? 'Shopify took too long to respond.'
      : 'Could not reach Shopify.'
    return { data: null, errors: [message] }
  }
}

export interface UserError {
  field?: string[] | null
  message: string
}

/** Throws with a caller-friendly message when Shopify returns userErrors. */
export function assertNoUserErrors(userErrors: UserError[] | undefined | null, context: string): void {
  if (userErrors && userErrors.length > 0) {
    const detail = userErrors.map((e) => e.message).filter(Boolean).join('; ')
    throw new Error(`${context}: ${detail || 'Shopify rejected the request.'}`)
  }
}
