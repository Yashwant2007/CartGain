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

    if (!response.ok) {
      const errText = await response.text().catch(() => '(no body)')
      console.error(`Shopify webhook ${topic} registration failed: ${response.status} ${errText}`)
    }
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

export async function fetchAbandonedCheckouts(
  shopDomain: string,
  accessToken: string,
  createdAtMin: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const url = `https://${shopDomain}/admin/api/2026-04/checkouts.json?created_at_min=${encodeURIComponent(createdAtMin)}&status=open&limit=${limit}`
    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    const data = await response.json()
    return data.checkouts || []
  } catch (error) {
    console.error('Failed to fetch Shopify checkouts:', error)
    return []
  }
}

export async function syncAbandonedCheckouts(store: { id: string; domain: string; apiKey: string | null }): Promise<number> {
  const accessToken = store.apiKey ? (await import('@/lib/encryption')).decrypt(store.apiKey) : null
  if (!accessToken) return 0

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const checkouts = await fetchAbandonedCheckouts(store.domain, accessToken, fiveMinutesAgo)

  if (checkouts.length === 0) return 0

  const prisma = (await import('@/lib/db')).default
  let synced = 0

  for (const checkout of checkouts) {
    const token = checkout.token || checkout.cart_token
    if (!token || !checkout.id) continue

    const lineItems = (checkout.line_items || []).map((item: any) => ({
      name: item.title || item.name || 'Item',
      description: item.variant_title || undefined,
      price: item.price != null ? parseFloat(item.price) : 0,
      quantity: item.quantity || 1,
      image: item.image?.src || item.image || undefined,
    }))

    const phone = checkout.phone || checkout.billing_address?.phone || checkout.shipping_address?.phone || checkout.customer?.phone || null
    const firstName = checkout.billing_address?.first_name || checkout.shipping_address?.first_name || checkout.customer?.first_name || ''
    const lastName = checkout.billing_address?.last_name || checkout.shipping_address?.last_name || checkout.customer?.last_name || ''
    const name = `${firstName} ${lastName}`.trim() || checkout.customer?.name || null
    const email = checkout.email || checkout.customer?.email || null

    try {
      await prisma.cart.upsert({
        where: { storeId_cartId: { storeId: store.id, cartId: token } },
        update: {
          items: lineItems,
          totalValue: checkout.total_price ? parseFloat(checkout.total_price) : 0,
          ...(email ? { customerEmail: email } : {}),
          ...(phone ? { customerPhone: phone } : {}),
          ...(name ? { customerName: name } : {}),
          abandonedAt: checkout.created_at ? new Date(checkout.created_at) : new Date(),
          currency: checkout.currency || 'USD',
        },
        create: {
          storeId: store.id,
          cartId: token,
          customerId: checkout.customer?.id ? String(checkout.customer.id) : undefined,
          items: lineItems,
          totalValue: checkout.total_price ? parseFloat(checkout.total_price) : 0,
          customerEmail: email,
          customerPhone: phone,
          customerName: name,
          currency: checkout.currency || 'USD',
          abandonedAt: checkout.created_at ? new Date(checkout.created_at) : new Date(),
        },
      })
      synced++
    } catch (err) {
      console.error(`Failed to sync checkout ${token}:`, err)
    }
  }

  return synced
}
