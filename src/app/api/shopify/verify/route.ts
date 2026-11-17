import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { ShopifyReconnectRequiredError } from '@/lib/shopify'
import { verifyShopifyInstallation } from '@/lib/shopify/verification'

export const dynamic = 'force-dynamic'

const RECONNECT_MESSAGE =
  'Your Shopify connection has expired. Reconnect the store from Integrations, then try again.'

function reconnectResponse() {
  return NextResponse.json({
    connected: false,
    error: RECONNECT_MESSAGE,
    reauthRequired: true,
    code: 'SHOPIFY_RECONNECT_REQUIRED',
  })
}

async function verify(request?: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const store = await prisma.store.findFirst({
    where: { userId: session.user.id, platform: 'shopify' },
  })
  if (!store || !store.apiKey || !store.domain) return reconnectResponse()

  let code: string | null = null
  if (request?.method === 'POST') {
    const body: unknown = await request.json().catch(() => ({}))
    const payload = body === null ? {} : body
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const rawCode = (payload as { code?: unknown }).code
    if (rawCode !== undefined && rawCode !== null && typeof rawCode !== 'string') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const trimmed = typeof rawCode === 'string' ? rawCode.trim() : ''
    if (trimmed.length > 256) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    code = trimmed || null
  }

  try {
    const verification = await verifyShopifyInstallation(store, code ? { code } : {})
    return NextResponse.json({
      connected: true,
      ...verification,
      verification,
    })
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) return reconnectResponse()
    return NextResponse.json(
      {
        connected: false,
        error: 'Shopify verification failed',
        code: 'SHOPIFY_VERIFICATION_FAILED',
      },
      { status: 502 },
    )
  }
}

export async function GET() {
  return verify()
}

export async function POST(request: NextRequest) {
  return verify(request)
}
