import axios from 'axios'

interface ShopifyGraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export async function queryShopifyGraphQL<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const response = await axios.post<ShopifyGraphQLResponse<T>>(
      `https://${shop}/admin/api/2026-04/graphql.json`,
      { query, variables },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    )

    if (response.data.errors) {
      throw new Error(`GraphQL Error: ${response.data.errors[0].message}`)
    }

    return response.data.data as T
  } catch (error) {
    console.error('Shopify GraphQL Error:', error)
    throw error
  }
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
