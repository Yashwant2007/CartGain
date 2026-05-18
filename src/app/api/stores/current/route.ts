import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

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
      select: {
        id: true,
        name: true,
        domain: true,
      },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
    }

    return NextResponse.json({ store })
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

    const updatedStore = await prisma.store.update({
      where: { id: store.id },
      data: {
        ...(typeof name === 'string' ? { name } : {}),
        ...(typeof domain === 'string' ? { domain } : {}),
        ...(typeof timezone === 'string' ? { timezone } : {}),
        ...(typeof currency === 'string' ? { currency } : {}),
        ...(typeof platform === 'string' ? { platform } : {}),
        ...(typeof webhookUrl === 'string' ? { webhookUrl } : {}),
        ...(typeof apiKey === 'string' ? { apiKey } : {}),
        ...(typeof apiSecret === 'string' ? { apiSecret } : {}),
      },
      select: {
        id: true,
        name: true,
        domain: true,
        timezone: true,
        currency: true,
        platform: true,
        webhookUrl: true,
        apiKey: true,
        apiSecret: true,
      },
    })

    return NextResponse.json({ store: updatedStore })
  } catch (error) {
    console.error('Current store update error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
