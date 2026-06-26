import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

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

    const decryptedApiKey = store.apiKey ? decrypt(store.apiKey) : null
    const decryptedApiSecret = store.apiSecret ? decrypt(store.apiSecret) : null

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        domain: store.domain,
        timezone: store.timezone,
        currency: store.currency,
        platform: store.platform,
        webhookUrl: store.webhookUrl,
        apiKey: decryptedApiKey,
        apiSecret: decryptedApiSecret,
      },
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
    const { name, domain, timezone, currency, platform, webhookUrl, apiKey, apiSecret } = body

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
    }

    const data: Record<string, any> = {}
    if (typeof name === 'string') data.name = name
    if (typeof domain === 'string') data.domain = domain
    if (typeof timezone === 'string') data.timezone = timezone
    if (typeof currency === 'string') data.currency = currency
    if (typeof platform === 'string') data.platform = platform
    if (typeof webhookUrl === 'string') data.webhookUrl = webhookUrl
    if (typeof apiKey === 'string') data.apiKey = apiKey ? encrypt(apiKey) : ''
    if (typeof apiSecret === 'string') data.apiSecret = apiSecret ? encrypt(apiSecret) : ''

    const updatedStore = await prisma.store.update({
      where: { id: store.id },
      data,
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
    console.error('Current store update error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
