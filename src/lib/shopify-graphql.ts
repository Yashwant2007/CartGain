import axios from 'axios'
import { retryDelayMs, isRetryableStatus, assertAllowedShopifyHost } from '@/lib/shopify'

interface ShopifyGraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: any }>
}

const SHOPIFY_MAX_RETRIES = 3

export async function queryShopifyGraphQL<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  assertAllowedShopifyHost(`https://${shop}/admin/api/2026-04/graphql.json`)
  
  let attempt = 0
  while (attempt <= SHOPIFY_MAX_RETRIES) {
    try {
      const response = await axios.post<ShopifyGraphQLResponse<T>>(
        `https://${shop}/admin/api/2026-04/graphql.json`,
        { query, variables },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      )

      if (response.data.errors && response.data.errors.length > 0) {
        const msg = response.data.errors[0].message || ''
        // Some errors are retryable
        if ((msg.toLowerCase().includes('throttle') || msg.toLowerCase().includes('rate')) && attempt < SHOPIFY_MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs({ status: 429, headers: response.headers as any }, attempt)))
          attempt++
          continue
        }
        throw new Error(`GraphQL Error: ${msg}`)
      }

      return response.data.data as T
    } catch (error: any) {
      const status = error.response?.status
      if (status && isRetryableStatus(status) && attempt < SHOPIFY_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs({ status, headers: error.response.headers || {} }, attempt)))
        attempt++
        continue
      }
      console.error('Shopify GraphQL Error:', error?.response?.data || error?.message)
      throw error
    }
  }
  
  throw new Error('Shopify GraphQL request failed after retries')
}
