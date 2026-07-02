import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

    const scopes = [
      'read_checkouts',
      'write_checkouts',
      'read_orders',
      'write_orders',
      'read_customers',
      'write_customers',
      'read_products',
      'write_products',
      'read_merchant_managed_fulfillment_orders',
    ].join(',')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
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

    return NextResponse.json({ authUrl: authUrl.toString(), state })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('Shopify connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
