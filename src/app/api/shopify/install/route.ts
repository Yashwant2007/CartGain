import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { signOAuthState, isValidShopDomain, buildShopifyOAuthUrl } from '@/lib/shopify-oauth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// Verifies the HMAC Shopify sends on every install/load request.
// See: https://shopify.dev/docs/apps/auth/oauth/getting-started#verify-installation
function verifyShopifyInstallHmac(query: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return false

  const hmac = query.get('hmac')
  if (!hmac) return false

  // Build the message: all params except hmac, sorted, percent-encoded
  const pairs: string[] = []
  query.forEach((value, key) => {
    if (key !== 'hmac') {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    }
  })
  pairs.sort()
  const message = pairs.join('&')

  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// This is the App URL Shopify calls when a merchant installs or opens your app.
// Set "App URL" in the Shopify Partner Dashboard to:
//   https://cart-gain.com/api/shopify/install
//
// Shopify sends: GET /api/shopify/install?shop=xxx.myshopify.com&hmac=...&timestamp=...&host=...
// We verify the HMAC and immediately redirect to Shopify's OAuth authorize URL
// (no CartGain login wall in between). The callback auto-provisions a User +
// Store + free Subscription from the shop owner and lands them in the app.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')

    if (!shop || !isValidShopDomain(shop)) {
      return NextResponse.redirect(new URL('/?error=invalid_shop', req.url))
    }

    const secretConfigured = Boolean(process.env.SHOPIFY_API_SECRET)
    if (!secretConfigured) {
      console.error('[Shopify Install] SHOPIFY_API_SECRET is not configured — refusing install')
      return NextResponse.redirect(new URL('/?error=not_configured', req.url))
    }

    const valid = verifyShopifyInstallHmac(searchParams)
    if (!valid) {
      return NextResponse.redirect(new URL('/?error=invalid_signature', req.url))
    }

    const baseUrl = getAppBaseUrl(req)
    const host = searchParams.get('host')
    const embedded = searchParams.get('embedded') === '1'

    // Short-circuit: when Shopify re-opens an installed app in the admin iframe
    // we must NOT re-run OAuth. If the merchant is already authenticated and the
    // shop is already connected to their account, jump straight to the app UI.
    // We still re-verify the HMAC above so a replay from a stale URL can't
    // bounce an unrelated visitor into a connected dashboard.
    try {
      const session = await getServerSession(authOptions)
      if (session?.user?.id) {
        const connected = await prisma.store.findFirst({
          where: {
            domain: shop,
            userId: session.user.id,
            platform: 'shopify',
            apiKey: { not: null },
          },
          select: { id: true },
        })
        if (connected) {
          const dashUrl = new URL('/dashboard', baseUrl)
          if (embedded && host) {
            dashUrl.searchParams.set('host', host)
          }
          dashUrl.searchParams.set('shop', shop)
          const res = NextResponse.redirect(dashUrl)
          res.cookies.set('shopify_install_shop', shop, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 60 * 30,
            path: '/',
          })
          return res
        }
      }
    } catch {
      // Session lookup failed — fall through to OAuth, which re-establishes
      // the session from the shop owner on the callback side.
    }

    // Fresh install (or re-auth needed): jump straight into Shopify OAuth.
    // The state carries the shop + embed context but deliberately NO storeId —
    // the callback treats "no storeId" as the install-origin (auto-provision)
    // flow, distinct from a dashboard-driven "connect" state (which has one).
    const state = signOAuthState({ shop, host, embedded })
    if (!state) {
      return NextResponse.redirect(new URL('/?error=not_configured', req.url))
    }

    const redirectUri = `${baseUrl}/api/shopify/callback`
    const authUrl = buildShopifyOAuthUrl({ shop, state, redirectUri })

    const res = NextResponse.redirect(authUrl)

    // Also set a short-lived cookie so the dashboard can auto-fill the shop domain.
    res.cookies.set('shopify_install_shop', shop, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 30, // 30 minutes
      path: '/',
    })

    return res
  } catch (error) {
    console.error('Shopify install error:', error)
    return NextResponse.redirect(new URL('/?error=install_failed', req.url))
  }
}
