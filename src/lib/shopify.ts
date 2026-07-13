import crypto from 'crypto'

const REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh 5 min before expiry

export async function getAccessToken(store: {
  id: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}): Promise<string | null> {
  if (!store.apiKey) return null

  const { decrypt, encrypt } = await import('@/lib/encryption')

  // No refresh token → legacy permanent token, use as-is
  if (!store.shopifyRefreshToken || !store.shopifyTokenExpiresAt) {
    try { return decrypt(store.apiKey) } catch { return null }
  }

  // Token still valid
  if (Date.now() < store.shopifyTokenExpiresAt.getTime() - REFRESH_MARGIN_MS) {
    try { return decrypt(store.apiKey) } catch { return null }
  }

  // Token expired or near expiry — refresh it
  const apiKey = process.env.SHOPIFY_API_KEY
  const apiSecret = process.env.SHOPIFY_API_SECRET
  if (!apiKey || !apiSecret) return null

  let refreshToken: string
  try { refreshToken = decrypt(store.shopifyRefreshToken) } catch { return null }

  try {
    const res = await fetch('https://admin.shopify.com/admin/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const newToken: string | undefined = data.access_token
    const newRefresh: string | undefined = data.refresh_token
    const expiresIn: number | undefined = data.expires_in

    if (!newToken) return null

    const prisma = (await import('@/lib/db')).default
    await prisma.store.update({
      where: { id: store.id },
      data: {
        apiKey: encrypt(newToken),
        ...(newRefresh ? { shopifyRefreshToken: encrypt(newRefresh) } : {}),
        ...(expiresIn ? { shopifyTokenExpiresAt: new Date(Date.now() + expiresIn * 1000) } : {}),
      },
    })

    return newToken
  } catch {
    return null
  }
}

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
  limit: number = 50
): Promise<any[] | null> {
  try {
    const url = `https://${shopDomain}/admin/api/2026-04/checkouts.json?status=open&limit=${limit}`
    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '(no body)')
      console.error(`Shopify checkout fetch failed (${response.status}): ${errText}`)
      if (response.status === 401) return null
      return []
    }
    const data = await response.json()
    return data.checkouts || []
  } catch (error) {
    console.error('Failed to fetch Shopify checkouts:', error)
    return []
  }
}

export async function syncAbandonedCheckouts(store: any): Promise<number> {
  const accessToken = await getAccessToken(store)
  if (!accessToken) {
    console.log(`No valid token for store ${store.domain} — skipping checkout sync`)
    return 0
  }

  const checkouts = await fetchAbandonedCheckouts(store.domain, accessToken)

  if (checkouts === null) {
    console.error(`🚫 Auth failed for ${store.domain} — token is deprecated or invalid. Store needs to reconnect from Integrations page.`)
    return -1
  }

  if (checkouts.length === 0) {
    console.log(`No abandoned checkouts found for ${store.domain} in last 24h`)
    return 0
  }

  console.log(`Found ${checkouts.length} abandoned checkouts for ${store.domain}`)

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
