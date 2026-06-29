import crypto from 'crypto'

export function verifyShopifyWebhook(body: string, headers: Headers): boolean {
  const hmacHeader = headers.get('x-shopify-hmac-sha256')
  const shopifySecret = process.env.SHOPIFY_API_SECRET

  if (!hmacHeader || !shopifySecret) {
    return false
  }

  const hmac = crypto
    .createHmac('sha256', shopifySecret)
    .update(body, 'utf8')
    .digest('base64')

  return hmac === hmacHeader
}

export async function verifyShopifyAccessToken(accessToken: string): Promise<{
  valid: boolean
  shop?: string
  userId?: string
}> {
  try {
    // Exchange token for shop domain
    const response = await fetch(`https://api.shopify.com/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code: accessToken,
      }),
    })

    const data = await response.json()

    if (data.access_token) {
      return {
        valid: true,
        shop: data.shop,
        userId: data.associated_user?.id,
      }
    }

    return { valid: false }
  } catch (error) {
    console.error('Shopify token verification error:', error)
    return { valid: false }
  }
}

export async function createShopifyWebhook(
  shopDomain: string,
  accessToken: string,
  topic: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/2026-04/webhooks.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        webhook: {
          topic,
          address: webhookUrl,
          format: 'json',
        },
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Failed to create Shopify webhook:', error)
    return false
  }
}

export async function setupShopifyWebhooks(
  shopDomain: string,
  accessToken: string,
  baseUrl: string
): Promise<void> {
  const webhookUrl = `${baseUrl}/api/webhooks/shopify`

  const topics = [
    'carts/update',
    'checkouts/create',
    'checkouts/update',
    'orders/create',
  ]

  for (const topic of topics) {
    await createShopifyWebhook(shopDomain, accessToken, topic, webhookUrl)
  }
}

export async function fetchShopifyCarts(
  shopDomain: string,
  accessToken: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const response = await fetch(
      `https://${shopDomain}/admin/api/2026-04/carts.json?limit=${limit}`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
        },
      }
    )

    const data = await response.json()
    return data.carts || []
  } catch (error) {
    console.error('Failed to fetch Shopify carts:', error)
    return []
  }
}
