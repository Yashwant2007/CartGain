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

export async function getCartsByCheckout(
  shop: string,
  accessToken: string,
  checkoutId: string
) {
  const query = `
    query GetCheckout($id: ID!) {
      checkout(id: $id) {
        id
        cart {
          id
          lines {
            id
            merchandise {
              id
              title
            }
            quantity
          }
        }
      }
    }
  `

  return queryShopifyGraphQL(shop, accessToken, query, {
    id: checkoutId,
  })
}

export async function getAbandonedCheckouts(
  shop: string,
  accessToken: string
) {
  const query = `
    query {
      checkouts(first: 100, query: "fulfillment_status:unshipped") {
        edges {
          node {
            id
            email
            phone
            createdAt
            updatedAt
            completedAt
            lineItems {
              id
              title
              quantity
              originalUnitPrice
            }
            subtotalPrice
            totalPrice
          }
        }
      }
    }
  `

  return queryShopifyGraphQL(shop, accessToken, query)
}

export async function createWebhook(
  shop: string,
  accessToken: string,
  topic: string,
  webhookUrl: string
) {
  const mutation = `
    mutation CreateWebhook($input: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(input: $input) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  `

  return queryShopifyGraphQL(shop, accessToken, mutation, {
    input: {
      topic: topic.toUpperCase() + '_SUBSCRIPTION',
      webhookSubscription: {
        callbackUrl: webhookUrl,
        format: 'JSON',
      },
    },
  })
}
