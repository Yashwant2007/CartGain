import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { shopifyConnectSchema, validateOrThrow, handleValidationError } from '@/lib/validation'
import { signOAuthState, isValidShopDomain } from '@/lib/shopify-oauth'
import { checkRateLimit } from '@/lib/rate-limit'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('shopify-connect', {
      maxAttempts: 10,
      windowMs: 5 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { shop, storeId } = validateOrThrow(shopifyConnectSchema, body)

    if (!isValidShopDomain(shop)) {
      return NextResponse.json({ error: 'Must be a valid .myshopify.com domain' }, { status: 400 })
    }

    // The state token is signed by us and trusted in the callback, so the store
    // it references MUST be verified to belong to the signed-in user. Otherwise
    // a user could pass another merchant's storeId and have the callback
    // overwrite that store's connection with their own credentials.
    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ error: 'Store not found or not owned by the signed-in user' }, { status: 403 })
    }

    // Refuse to bind a shop that already belongs to another CartGain user — the
    // Shopify webhook/store lookups are domain-keyed, so a duplicated domain
    // would silently route events to the wrong account.
    const existingOwner = await prisma.store.findFirst({
      where: { domain: shop, userId: { not: session.user.id } },
      select: { id: true },
    })
    if (existingOwner) {
      return NextResponse.json({ error: 'This Shopify store is already connected to another CartGain account' }, { status: 409 })
    }

    const apiKey = process.env.SHOPIFY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Shopify API key not configured' }, { status: 500 })
    }

    // Minimum necessary access. Kept in sync with shopify.app.toml.
    // - read_customers / read_checkouts / read_orders / read_products: recover
    //   abandoned carts and read the data needed for recovery + bargain pricing.
    // - write_checkouts: required alongside read_checkouts for the abandoned
    //   checkout REST endpoints CartGain uses.
    // - read_discounts / write_discounts: create and manage recovery discount
    //   codes (discountCodeBasicCreate).
    // - write_webhooks / read_webhooks: register/update Shopify webhooks at
    //   install time (including privacy/redaction topics).
    // Not requested: write_customers, write_orders, write_products,
    // write_draft_orders, read_draft_orders, fulfillment scopes — CartGain does
    // not write customers/orders/products and never uses draft orders.
    const scopes = [
      'read_checkouts',
      'write_checkouts',
      'read_orders',
      'read_customers',
      'read_products',
      'read_discounts',
      'write_discounts',
      'write_webhooks',
      'read_webhooks',
    ].join(',')

    const baseUrl = getAppBaseUrl(req)
    const redirectUri = `${baseUrl}/api/shopify/callback`

    const state = signOAuthState({ storeId, userId: session.user.id })
    if (!state) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
    authUrl.searchParams.set('client_id', apiKey)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)
    // Request expiring online tokens (Shopify deprecated non-expiring offline tokens).
    // Online tokens include expires_in + refresh_token — we store both in the callback.
    authUrl.searchParams.append('grant_options[]', 'per-user')

    const response = NextResponse.json({ authUrl: authUrl.toString(), state })

    await track({
      name: 'cartgain_shopify_connect_started',
      userId: session.user.id,
      storeId,
      properties: { shop },
    })

    const staleCookies = [
      '__Secure-next-auth.session-token',
      '__Secure-next-auth.callback-url',
      '__Secure-next-auth.csrf-token',
      '__Secure-next-auth.pkce.code_verifier',
    ]
    for (const name of staleCookies) {
      response.headers.append(
        'Set-Cookie',
        `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`
      )
    }

    return response
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    await captureError({
      level: 'error',
      component: 'oauth',
      operation: 'shopify_connect',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
