import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { setupShopifyWebhooks } from '@/lib/shopify'
import { generateCampaignSetup } from '@/lib/services/ai'

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

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null

    if (tokenData.refresh_token || tokenData.expires_in) {
      console.log(`Shopify token for ${shop}${tokenData.expires_in ? ` expires in ${tokenData.expires_in}s` : ''}${tokenData.refresh_token ? ', refresh token provided' : ''}`)
    }

    if (storeId) {
      await prisma.store.update({
        where: { id: storeId },
        data: {
          apiKey: encrypt(accessToken),
          apiSecret: encrypt(shop),
          platform: 'shopify',
          domain: shop,
          ...(tokenData.refresh_token ? { shopifyRefreshToken: encrypt(tokenData.refresh_token) } : {}),
          ...(tokenExpiresAt ? { shopifyTokenExpiresAt: tokenExpiresAt } : {}),
        },
      })
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
      await setupShopifyWebhooks(shop, accessToken, baseUrl)
    } catch (webhookError) {
      console.error('Failed to set up Shopify webhooks:', webhookError)
    }

    // AI-powered one-click campaign setup
    try {
      const targetStore = storeId
        ? await prisma.store.findUnique({ where: { id: storeId } })
        : await prisma.store.findFirst({ where: { domain: shop } })

      if (targetStore) {
        const existingCampaigns = await prisma.campaign.count({ where: { storeId: targetStore.id } })

        if (existingCampaigns === 0) {
          const config = await generateCampaignSetup({
            name: targetStore.name,
            domain: targetStore.domain,
            currency: targetStore.currency,
          })

          const campaign = await prisma.campaign.create({
            data: {
              storeId: targetStore.id,
              userId: targetStore.userId,
              name: config?.campaignName || 'Default Recovery Campaign',
              channels: config?.channels || ['email'],
              aiOptimized: config?.aiOptimized !== false,
              sendDelay: config?.sendDelay || 15,
              followUpDelay: config?.followUpDelay || 180,
              maxFollowUps: config?.maxFollowUps || 2,
              discountEnabled: config?.discountEnabled || false,
              discountType: config?.discountEnabled ? (config.discountType || 'percentage') : null,
              discountValue: config?.discountEnabled ? (config.discountValue || 10) : null,
              discountCode: config?.discountEnabled ? (config.discountCode || 'WELCOME10') : null,
              isActive: true,
            },
          })

          await prisma.aiSuggestion.create({
            data: {
              storeId: targetStore.id,
              userId: targetStore.userId,
              type: 'campaign_tip',
              title: 'AI Campaign Setup Complete',
              description: `AI configured "${campaign.name}" with ${campaign.channels.join(', ')} channels, ${campaign.sendDelay}min delay, ${campaign.maxFollowUps} follow-ups${campaign.discountEnabled ? `, and ${campaign.discountValue}% discount` : ''}.`,
              impact: 'high',
              metrics: { channels: campaign.channels, sendDelay: campaign.sendDelay, discountEnabled: campaign.discountEnabled } as any,
            },
          })

          console.log(`✅ AI-powered campaign setup complete for store ${targetStore.id}`)
        }
      }
    } catch (campaignError) {
      console.error('Failed to auto-create campaign:', campaignError)
    }

    return NextResponse.redirect(new URL('/shopify-connected', req.url))
  } catch (error) {
    console.error('Shopify callback error:', error)
    return NextResponse.redirect(new URL('/dashboard/integrations?shopify_error=Callback+processing+failed', req.url))
  }
}
