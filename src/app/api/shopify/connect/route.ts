import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shop, storeId } = await req.json()

    if (!shop || !storeId) {
      return NextResponse.json({ error: 'Shop and storeId are required' }, { status: 400 })
    }

    const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
    if (!cleanShop.endsWith('.myshopify.com') && !cleanShop.includes('.')) {
      return NextResponse.json({ error: 'Invalid Shopify store domain' }, { status: 400 })
    }

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

    const state = Buffer.from(JSON.stringify({ storeId, userId: session.user.id })).toString('base64')

    const authUrl = new URL(`https://${cleanShop}/admin/oauth/authorize`)
    authUrl.searchParams.set('client_id', apiKey)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)

    return NextResponse.json({ authUrl: authUrl.toString(), state })
  } catch (error) {
    console.error('Shopify connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
