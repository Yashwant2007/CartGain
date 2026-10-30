import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { encrypt } from '@/lib/encryption'
import { setupShopifyWebhooks } from '@/lib/shopify'
import { generateCampaignSetup } from '@/lib/services/ai'
import { verifyOAuthState, verifyShopifyCallbackHmac, isValidShopDomain } from '@/lib/shopify-oauth'
import { createFreeSubscription } from '@/lib/subscription'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import { mintNextAuthSessionCookie } from '@/lib/session-cookie'
import { shopDomainCandidates } from '@/lib/stores/resolve-by-domain'

export const dynamic = 'force-dynamic'

const STALE_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  '__Secure-next-auth.callback-url',
  '__Secure-next-auth.csrf-token',
  '__Secure-next-auth.pkce.code_verifier',
]

// Only a completed OAuth connection is evidence that this account owns the
// shop. Unconnected signup placeholders on the same domain are not a claim.
async function findConnectedStoreByShopDomain(shop: string) {
  for (const domain of shopDomainCandidates(shop)) {
    const store = await prisma.store.findFirst({
      where: {
        domain: { equals: domain, mode: 'insensitive' },
        platform: 'shopify',
        apiKey: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (store) return store
  }
  return null
}

async function fetchShopOwner(
  shop: string,
  accessToken: string,
): Promise<{ email?: string; name?: string }> {
  try {
    const res = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return {}
    const data = await res.json().catch(() => null)
    const owner = data?.shop
    const email = typeof owner?.email === 'string'
      ? owner.email
      : typeof owner?.customer_email === 'string'
        ? owner.customer_email
        : undefined
    const name = typeof owner?.shop_owner === 'string' ? owner.shop_owner : undefined
    return { email, name }
  } catch {
    return {}
  }
}

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
    // The state ALSO carries the shop it was minted for; the callback must
    // confirm it matches the callback's shop or a state issued for one shop
    // could be replayed to bind a different shop's credentials (cross-tenant).
    let storeId: string | null = null
    let installOrigin = false
    let embedHost: string | null = null
    try {
      const decoded = verifyOAuthState(state)
      if (!decoded) {
        throw new Error('Invalid state')
      }
      if (typeof decoded.shop !== 'string' || decoded.shop !== shop) {
        throw new Error('State shop mismatch')
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
    const apiSecret = process.env.SHOPIFY_API_SECRET?.trim()

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
    let provisionedUserId: string | null = null
    if (installOrigin) {
      const associatedUser = tokenData.associated_user as
        | { email?: string; first_name?: string; last_name?: string }
        | undefined
      let ownerEmail = associatedUser?.email?.toLowerCase().trim()
      let ownerName =
        [associatedUser?.first_name, associatedUser?.last_name].filter(Boolean).join(' ').trim()

      if (!ownerEmail) {
        const shopOwner = await fetchShopOwner(shop, accessToken)
        ownerEmail = shopOwner.email?.toLowerCase().trim()
        ownerName = ownerName || shopOwner.name?.trim() || ''
      }
      ownerName = ownerName || shop.replace('.myshopify.com', '')

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

      // Don't hijack a shop that's already CONNECTED to a different CartGain
      // account. An unconnected signup placeholder on the same domain is not a
      // claim of ownership (anyone can type a shop domain), so it must not block
      // the real shop from installing; domain-keyed lookups ignore it.
      const domainMatch = await findConnectedStoreByShopDomain(shop)
      if (domainMatch && domainMatch.userId !== user.id) {
        return redirectWithCleanup('/dashboard/integrations?shopify_error=Store+already+linked+to+another+account', baseUrl)
      }

      // Reuse the merchant's existing store row instead of creating a second
      // one. A merchant who signed up on CartGain already owns a placeholder
      // store, and every "current store" read resolves the account's OLDEST row
      // (/api/stores/current, /api/integrations/status). Creating a fresh row
      // here therefore left the connected Shopify store invisible while the
      // dashboard kept showing the old placeholder as "not connected".
      // Prefer an exact domain match; otherwise adopt the account's oldest
      // store in place.
      const existingStore =
        domainMatch ??
        (await prisma.store.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'asc' },
        }))

      const store = existingStore
        ? await prisma.store.update({
            where: { id: existingStore.id },
            data: { userId: user.id, platform: 'shopify', domain: shop, isActive: true },
          })
        : await prisma.store.create({
            data: {
              userId: user.id,
              name: ownerName,
              platform: 'shopify',
              domain: shop,
              currency: 'USD',
              timezone: 'UTC',
              isActive: true,
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
          // A store that just completed OAuth is live; make sure it isn't left
          // inactive (signup creates stores inactive until email verification,
          // and an inactive store is skipped by cart processing + bargaining).
          isActive: true,
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
      await setupShopifyWebhooks(
        {
          id: storeId!,
          domain: shop,
          apiKey: encrypt(accessToken),
          ...(tokenData.refresh_token
            ? { shopifyRefreshToken: encrypt(tokenData.refresh_token) }
            : { shopifyRefreshToken: null }),
          shopifyTokenExpiresAt: tokenExpiresAt ?? null,
        },
        baseUrl,
      )
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
        : await findConnectedStoreByShopDomain(shop)

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
        await mintNextAuthSessionCookie(res, {
          sub: user.id,
          email: user.email,
          name: user.name,
          storeId: store.id,
          requirePassword: !user.password,
          tokenVersion: user.tokenVersion ?? 0,
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