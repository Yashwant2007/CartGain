import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { shopifyConnectSchema, validateOrThrow, handleValidationError } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { shop, storeId } = validateOrThrow(shopifyConnectSchema, body)

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

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const payload = Buffer.from(JSON.stringify({ storeId, userId: session.user.id })).toString('base64url')
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    const state = `${payload}.${sig}`

    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
    authUrl.searchParams.set('client_id', apiKey)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)
    // Request expiring online tokens (Shopify deprecated non-expiring offline tokens).
    // Online tokens include expires_in + refresh_token — we store both in the callback.
    authUrl.searchParams.append('grant_options[]', 'per-user')

    const response = NextResponse.json({ authUrl: authUrl.toString(), state })

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
    console.error('Shopify connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
