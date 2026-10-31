import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { fetchShopifyWithAuth, ShopifyReconnectRequiredError } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

const RECONNECT_MESSAGE =
  'Your Shopify connection has expired. Reconnect the store from Integrations, then try again.'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id, platform: 'shopify' },
    })

    if (!store || !store.apiKey || !store.domain) {
      return NextResponse.json({ connected: false })
    }

    const shop = store.domain

    let res: Response
    try {
      res = await fetchShopifyWithAuth(
        store,
        `https://${shop}/admin/api/2026-04/shop.json`,
        { signal: AbortSignal.timeout(10000) },
      )
    } catch (error) {
      if (error instanceof ShopifyReconnectRequiredError) {
        return NextResponse.json({
          connected: false,
          error: RECONNECT_MESSAGE,
          reauthRequired: true,
        })
      }
      throw error
    }

    if (res.ok) {
      const data = await res.json()
      const expiresAt = store.shopifyTokenExpiresAt
      return NextResponse.json({
        connected: true,
        shopName: data.shop?.name || shop,
        domain: shop,
        ...(expiresAt ? { tokenExpiresAt: expiresAt.toISOString() } : {}),
      })
    }

    const errBody = await res.text().catch(() => '(no body)')
    return NextResponse.json({
      connected: false,
      error: `Shopify API returned status ${res.status}: ${errBody.slice(0, 200)}`,
    })
  } catch (error) {
    console.error('Shopify health check error:', error)
    return NextResponse.json({ connected: false, error: 'Health check failed' })
  }
}
