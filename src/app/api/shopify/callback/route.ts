import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { setupShopifyWebhooks } from '@/lib/shopify'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!shop || !code) {
      return NextResponse.redirect(new URL('/dashboard/settings?shopify_error=Missing+parameters', req.url))
    }

    let storeId: string | null = null
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
        storeId = decoded.storeId
      } catch {
        // state decode failed - continue without
      }
    }

    const apiKey = process.env.SHOPIFY_API_KEY
    const apiSecret = process.env.SHOPIFY_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.redirect(new URL('/dashboard/settings?shopify_error=Shopify+not+configured', req.url))
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Shopify token exchange failed:', errorText)
      return NextResponse.redirect(new URL('/dashboard/settings?shopify_error=Token+exchange+failed', req.url))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return NextResponse.redirect(new URL('/dashboard/settings?shopify_error=No+access+token+received', req.url))
    }

    if (storeId) {
      await prisma.store.update({
        where: { id: storeId },
        data: {
          apiKey: accessToken,
          apiSecret: shop,
          platform: 'shopify',
          domain: shop,
        },
      })
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      await setupShopifyWebhooks(shop, accessToken, baseUrl)
    } catch (webhookError) {
      console.error('Failed to set up Shopify webhooks:', webhookError)
    }

    return NextResponse.redirect(new URL('/dashboard/settings?shopify_connected=true', req.url))
  } catch (error) {
    console.error('Shopify callback error:', error)
    return NextResponse.redirect(new URL('/dashboard/settings?shopify_error=Callback+processing+failed', req.url))
  }
}
