import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'
import { storeUpdateSchema, validateOrThrow, handleValidationError } from '@/lib/validation'
import { getAuthContext } from '@/lib/embedded-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req)

    if (!auth?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const session = { user: { id: auth.user.id } } as any

    const store = await prisma.store.findFirst({
      where: {
        userId: session.user.id,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
    }

    const decryptedApiSecret = store.apiSecret ? decrypt(store.apiSecret) : null
    const apiKeyPreview = store.apiKey
      ? `••••••••${decrypt(store.apiKey).slice(-6)}`
      : null
    // For Shopify the apiSecret is the shop domain (needed for display); for
    // other platforms it is a live secret — never ship the raw value.
    const shopDomain = decryptedApiSecret?.endsWith('.myshopify.com') ? decryptedApiSecret : null
    const apiSecretPreview = decryptedApiSecret
      ? `••••••••${decryptedApiSecret.slice(-6)}`
      : null

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        domain: store.domain,
        timezone: store.timezone,
        currency: store.currency,
        platform: store.platform,
        webhookUrl: store.webhookUrl,
        // Never expose the raw access token to the browser — only a masked preview.
        apiKey: apiKeyPreview,
        // Shopify shops expose their myshopify.com domain via shopDomain; raw
        // apiSecret is never sent to the browser.
        shopDomain,
        apiSecret: apiSecretPreview,
      },
      hasPassword: !!(await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { password: true },
      }))?.password,
    })
  } catch (error) {
    console.error('Current store lookup error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthContext(request)
    if (!auth?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const session = { user: { id: auth.user.id } } as any

    const body = await request.json()
    const data = validateOrThrow(storeUpdateSchema, body)

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
    }

    // A Shopify store is always addressed by its *.myshopify.com host (that is
    // what every Admin API call + access token relies on). Refuse to leave a
    // Shopify store pointed anywhere else, even if only the platform or the
    // domain was changed in this request — otherwise a stale/attacker domain
    // could redirect outbound authenticated calls.
    const effectivePlatform = data.platform ?? store.platform
    const effectiveDomain = (data.domain ?? store.domain ?? '').replace(/^https?:\/\//i, '').split('/')[0]
    if (effectivePlatform === 'shopify' && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(effectiveDomain)) {
      return NextResponse.json(
        { message: 'Shopify stores must use their *.myshopify.com domain' },
        { status: 400 },
      )
    }

    const updateData: Record<string, any> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.domain !== undefined) updateData.domain = data.domain
    if (data.timezone !== undefined) updateData.timezone = data.timezone
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.platform !== undefined) updateData.platform = data.platform
    if (data.webhookUrl !== undefined) updateData.webhookUrl = data.webhookUrl
    // Disconnect = clearing the credentials. Store null (not empty string) so
    // that "is this store connected?" checks keyed on `apiKey != null` don't
    // treat a disconnected store as still linked. Also drop the derived Shopify
    // refresh token + expiry so no live credential is left behind.
    let disconnected = false
    if (data.apiKey !== undefined) {
      updateData.apiKey = data.apiKey ? encrypt(data.apiKey) : null
      if (!data.apiKey) disconnected = true
    }
    if (data.apiSecret !== undefined) {
      updateData.apiSecret = data.apiSecret ? encrypt(data.apiSecret) : null
      if (!data.apiSecret) disconnected = true
    }
    // Per-store webhook signing secret is always encrypted at rest and never
    // returned. Setting it binds Shopify webhook verification to this store.
    if (data.webhookSecret !== undefined) {
      updateData.webhookSecret = data.webhookSecret ? encrypt(data.webhookSecret) : null
    }
    if (disconnected) {
      updateData.shopifyRefreshToken = null
      updateData.shopifyTokenExpiresAt = null
    }

    const updatedStore = await prisma.store.update({
      where: { id: store.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        domain: true,
        timezone: true,
        currency: true,
        platform: true,
        webhookUrl: true,
      },
    })

    return NextResponse.json({ store: updatedStore })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('Current store update error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
