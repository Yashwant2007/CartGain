import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { setupShopifyWebhooks } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!shop || !code) {
      return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=Missing+parameters', req.url))
    }

    // Verify state HMAC to prevent CSRF
    let storeId: string | null = null
    if (state) {
      try {
        const secret = process.env.NEXTAUTH_SECRET
        const dotIndex = state.lastIndexOf('.')
        if (!secret || dotIndex === -1) throw new Error('Invalid state format')

        const payload = state.slice(0, dotIndex)
        const receivedSig = state.slice(dotIndex + 1)
        const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')

        const sigValid = crypto.timingSafeEqual(
          Buffer.from(receivedSig.padEnd(64, '0').slice(0, 64), 'hex'),
          Buffer.from(expectedSig, 'hex'),
        )
        if (!sigValid) throw new Error('Signature mismatch')

        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
        storeId = decoded.storeId
      } catch {
        return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=Invalid+state', req.url))
      }
    }

    const apiKey = process.env.SHOPIFY_API_KEY
    const apiSecret = process.env.SHOPIFY_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=Shopify+not+configured', req.url))
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
      return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=Token+exchange+failed', req.url))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=No+access+token+received', req.url))
    }

    if (storeId) {
      await prisma.store.update({
        where: { id: storeId },
        data: {
          apiKey: encrypt(accessToken),
          apiSecret: encrypt(shop),
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

    // Auto-create default campaign
    try {
      const targetStore = storeId
        ? await prisma.store.findUnique({ where: { id: storeId } })
        : await prisma.store.findFirst({ where: { domain: shop } })

      if (targetStore) {
        const existingCampaigns = await prisma.campaign.count({ where: { storeId: targetStore.id } })

        if (existingCampaigns === 0) {
          await prisma.campaign.create({
            data: {
              storeId: targetStore.id,
              userId: targetStore.userId,
              name: 'Default Recovery Campaign',
              channels: ['whatsapp', 'sms', 'email'],
              aiOptimized: true,
              sendDelay: 15,
              followUpDelay: 180,
              maxFollowUps: 2,
              isActive: true,
            },
          })
          console.log(`✅ Auto-created default campaign for store ${targetStore.id}`)
        }
      }
    } catch (campaignError) {
      console.error('Failed to auto-create campaign:', campaignError)
    }

    return NextResponse.redirect(new URL('/dashboard/integrations?shopify_connected=true', req.url))
  } catch (error) {
    console.error('Shopify callback error:', error)
    return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=Callback+processing+failed', req.url))
  }
}
