import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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
// We verify the HMAC, store the shop in a cookie, and redirect to login/signup.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const shop = searchParams.get('shop')

  if (!shop || !shop.endsWith('.myshopify.com')) {
    return NextResponse.redirect(new URL('/?error=invalid_shop', req.url))
  }

  // Verify Shopify's HMAC signature (skip only if SHOPIFY_API_SECRET not configured yet)
  if (process.env.SHOPIFY_API_SECRET) {
    const valid = verifyShopifyInstallHmac(searchParams)
    if (!valid) {
      return NextResponse.redirect(new URL('/?error=invalid_signature', req.url))
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Redirect merchant to signup, carrying the shop domain so after they log in
  // they land on the integrations page ready to connect.
  const signupUrl = new URL('/signup', baseUrl)
  signupUrl.searchParams.set('shop', shop)
  signupUrl.searchParams.set('next', '/dashboard/integrations')

  const res = NextResponse.redirect(signupUrl)

  // Also set a short-lived cookie so the dashboard can auto-fill the shop domain
  res.cookies.set('shopify_install_shop', shop, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 30, // 30 minutes
    path: '/',
  })

  return res
}
