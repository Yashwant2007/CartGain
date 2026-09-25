import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { encrypt } from '@/lib/encryption'
import { setupShopifyWebhooks } from '@/lib/shopify'
import { generateCampaignSetup } from '@/lib/services/ai'
import { verifyOAuthState, verifyShopifyCallbackHmac, isValidShopDomain } from '@/lib/shopify-oauth'
import { createFreeSubscription } from '@/lib/subscription'
import { encode } from 'next-auth/jwt'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

const STALE_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  '__Secure-next-auth.callback-url',
  '__Secure-next-auth.csrf-token',
  '__Secure-next-auth.pkce.code_verifier',
]

// The live session cookie set by NextAuth (see src/lib/auth.ts cookies config).
// Must match exactly, including the Partitioned (CHIPS) attribute so the
// session survives inside Shopify's cross-site admin iframe.
const SESSION_COOKIE_NAME = 'next-auth.session-token'

function redirectWithCleanup(path: string, baseUrl: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, baseUrl))
  for (const name of STALE_COOKIE_NAMES) {
    res.headers.append(
      'Set-Cookie',
      `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`
    )
  }
  return res
}

async function mintSessionCookie(
  res: NextResponse,
  payload: {
    sub: string
    email: string
    name?: string | null
    storeId: string
    requirePassword: boolean
  }
): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET not configured')

  const sessionToken = await encode({
    token: {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? undefined,
      storeId: payload.storeId,
      requirePassword: payload.requirePassword,
    },
    secret,
    maxAge: 30 * 24 * 60 * 60, // matches session.maxAge in src/lib/auth.ts
  })

  // Build the Set-Cookie by hand to guarantee the Partitioned attribute; the
  // NextResponse cookies API types don't expose it consistently across versions.
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${30 * 24 * 60 * 60}`
  )
}

export async function GET(req: NextRequest) {
  const baseUrl = getAppBaseUrl(req)

  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!shop || !code) {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Missing+parameters', baseUrl)
    }

    if (!state) {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Missing+state', baseUrl)
    }

    // Verify Shopify signed the callback: shop, code, timestamp and state are
    // all covered by the callback HMAC, so a tampered or replayed-elsewhere
    // callback is rejected before we exchange anything.
    if (!verifyShopifyCallbackHmac(searchParams)) {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Invalid+callback+signature', baseUrl)
    }

    if (!isValidShopDomain(shop)) {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Invalid+shop+domain', baseUrl)
    }

    // The signed state tells us which flow we're in:
    //  - storeId present → dashboard-driven "connect" (merchant already logged
    //    in, store already exists).
    //  - no storeId → install-origin (App Install button) → auto-provision the
    //    User + Store + free Subscription from the shop owner and log them in.
    let storeId: string | null = null
    let installOrigin = false
    let embedHost: string | null = null
    try {
      const decoded = verifyOAuthState(state)
      if (!decoded) {
        throw new Error('Invalid state')
      }
      if (typeof decoded.storeId === 'string' && decoded.storeId) {
        storeId = decoded.storeId
      } else {
        installOrigin = true
        embedHost = typeof decoded.host === 'string' ? decoded.host : null
      }
    } catch {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Invalid+state', baseUrl)
    }

    const apiKey = process.env.SHOPIFY_API_KEY
    const apiSecret = process.env.SHOPIFY_API_SECRET

    if (!apiKey || !apiSecret) {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Shopify+not+configured', baseUrl)
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
      return redirectWithCleanup('/dashboard/integrations?shopify_error=Token+exchange+failed', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return redirectWithCleanup('/dashboard/integrations?shopify_error=No+access+token+received', baseUrl)
    }

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null

    if (tokenData.refresh_token || tokenData.expires_in) {
      console.log(`Shopify token for ${shop}${tokenData.expires_in ? ` expires in ${tokenData.expires_in}s` : ''}${tokenData.refresh_token ? ', refresh token provided' : ''}`)
    }

    // ── Install-origin auto-provision ──
    // For online (per-user) tokens the token response includes the authorizing
    // staff member. Use their email as the CartGain account email; the store
    // owner installing the app becomes the account owner.
    let provisionedUserId: string | null = null
    if (installOrigin) {
      const associatedUser = tokenData.associated_user as
        | { email?: string; first_name?: string; last_name?: string }
        | undefined
      const ownerEmail = associatedUser?.email?.toLowerCase().trim()
      const ownerName =
        [associatedUser?.first_name, associatedUser?.last_name].filter(Boolean).join(' ').trim() ||
        shop.replace('.myshopify.com', '')

      if (!ownerEmail) {
        return redirectWithCleanup('/dashboard/integrations?shopify_error=Owner+email+not+available', baseUrl)
      }

      let user = await prisma.user.findUnique({ where: { email: ownerEmail } })
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: ownerEmail,
            name: ownerName,
          },
        })
      }
      provisionedUserId = user.id

      // Don't hijack a shop that's already connected to a different CartGain
      // account (webhook/store lookups are domain-keyed).
      const existingStore = await prisma.store.findFirst({ where: { domain: shop } })
      if (existingStore && existingStore.userId !== user.id) {
        return redirectWithCleanup('/dashboard/integrations?shopify_error=Store+already+linked+to+another+account', baseUrl)
      }

      const store = existingStore
        ? await prisma.store.update({
            where: { id: existingStore.id },
            data: { userId: user.id },
          })
        : await prisma.store.create({
            data: {
              userId: user.id,
              name: ownerName,
              platform: 'shopify',
              domain: shop,
              currency: 'USD',
              timezone: 'UTC',
            },
          })
      storeId = store.id

      // Every auto-provisioned account gets a free subscription (idempotent).
      await createFreeSubscription(user.id)
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

    await track({
      name: 'cartgain_shopify_oauth_completed',
      storeId: storeId,
      userId: provisionedUserId ?? undefined,
      properties: { shop },
    })

    try {
      await setupShopifyWebhooks(shop, accessToken, baseUrl)
    } catch (webhookError) {
      await captureError({
        level: 'error',
        component: 'webhook',
        operation: 'setup_shopify_webhooks',
        error: webhookError,
        req,
        persist: true,
      })
    }

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

        // Onboarding: automatically enable the bargaining widget the moment a
        // store connects. Without this, the storefront embed hides itself
        // (cg_empty) until the merchant manually opens the Bargain dashboard
        // and toggles "Enable Bargain" — a common reason the widget "never shows".
        await prisma.bargainConfig.upsert({
          where: { storeId: targetStore.id },
          update: { enabled: true },
          create: { storeId: targetStore.id, enabled: true },
        })
        console.log(`✅ Bargain enabled automatically for store ${targetStore.id}`)
      }
    } catch (campaignError) {
      await captureError({
        level: 'error',
        component: 'dashboard',
        operation: 'auto_create_campaign',
        error: campaignError,
        req,
        persist: true,
      })
    }

    // ── Landing ──
    if (installOrigin) {
      // Auto-provisioned install: mint the CartGain session so the merchant is
      // logged straight in, then land them in the embedded app UI (dashboard).
      const user = provisionedUserId
        ? await prisma.user.findUnique({ where: { id: provisionedUserId } })
        : null
      const store = storeId ? await prisma.store.findUnique({ where: { id: storeId } }) : null

      if (!user || !store) {
        return redirectWithCleanup('/login?error=Provisioning+incomplete', baseUrl)
      }

      const target = new URL('/dashboard', baseUrl)
      if (embedHost) target.searchParams.set('host', embedHost)
      target.searchParams.set('shop', shop)
      target.searchParams.set('shopify_connected', 'true')

      const res = redirectWithCleanup(target.pathname + target.search, baseUrl)
      try {
        await mintSessionCookie(res, {
          sub: user.id,
          email: user.email,
          name: user.name,
          storeId: store.id,
          requirePassword: !user.password,
        })
      } catch (sessionError) {
        console.error('Failed to mint session cookie:', sessionError)
        return redirectWithCleanup('/login?error=Session+failed', baseUrl)
      }
      return res
    }

    return redirectWithCleanup('/shopify-connected', baseUrl)
  } catch (error) {
    await captureError({
      level: 'error',
      component: 'oauth',
      operation: 'shopify_callback',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return redirectWithCleanup('/dashboard/integrations?shopify_error=Callback+processing+failed', baseUrl)
  }
}