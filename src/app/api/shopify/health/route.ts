import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getAccessToken } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

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

    const accessToken = await getAccessToken(store)
    if (!accessToken) {
      const hasRefresh = store.shopifyRefreshToken && store.shopifyTokenExpiresAt
      if (hasRefresh) {
        return NextResponse.json({
          connected: false,
          error: 'Shopify token expired and refresh failed. Please reconnect your store.',
          reauthRequired: true,
        })
      }
      return NextResponse.json({
        connected: false,
        error: 'Deprecated offline token. Please reconnect your store to get a new expiring token.',
        reauthRequired: true,
      })
    }

    const shop = store.domain
    const res = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    if (res.ok) {
      const data = await res.json()
      const expiresAt = store.shopifyTokenExpiresAt
      return NextResponse.json({
        connected: true,
        shopName: data.shop?.name || shop,
        domain: shop,
        ...(expiresAt ? { tokenExpiresAt: expiresAt.toISOString() } : { tokenType: 'permanent (legacy)' }),
      })
    }

    const errBody = await res.text().catch(() => '(no body)')

    if (res.status === 401) {
      if (errBody.toLowerCase().includes('deprecated') || errBody.toLowerCase().includes('offline')) {
        return NextResponse.json({
          connected: false,
          error: 'Deprecated offline token. New expiring offline tokens are replacing tokens that grant permanent offline access. Please reconnect your Shopify store.',
          reauthRequired: true,
        })
      }
      return NextResponse.json({
        connected: false,
        error: 'Shopify access token is invalid or expired. Please reconnect your store.',
        reauthRequired: true,
      })
    }

    return NextResponse.json({
      connected: false,
      error: `Shopify API returned status ${res.status}: ${errBody.slice(0, 200)}`,
    })
  } catch (error) {
    console.error('Shopify health check error:', error)
    return NextResponse.json({ connected: false, error: 'Health check failed' })
  }
}
