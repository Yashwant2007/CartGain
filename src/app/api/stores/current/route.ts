import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'
import { storeUpdateSchema, validateOrThrow, handleValidationError } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

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

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = validateOrThrow(storeUpdateSchema, body)

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
    }

    const updateData: Record<string, any> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.domain !== undefined) updateData.domain = data.domain
    if (data.timezone !== undefined) updateData.timezone = data.timezone
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.platform !== undefined) updateData.platform = data.platform
    if (data.webhookUrl !== undefined) updateData.webhookUrl = data.webhookUrl
    if (data.apiKey !== undefined) updateData.apiKey = data.apiKey ? encrypt(data.apiKey) : ''
    if (data.apiSecret !== undefined) updateData.apiSecret = data.apiSecret ? encrypt(data.apiSecret) : ''

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
