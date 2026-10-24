import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req)

    if (!auth?.user?.id) {
      return unauthorizedResponse()
    }
    const userId = auth.user.id

    const stores = await prisma.store.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        domain: true,
        platform: true,
        currency: true,
        timezone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        apiKey: true,
        apiSecret: true,
        webhookUrl: true,
      },
    })

    const data = stores.map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      platform: s.platform,
      currency: s.currency,
      timezone: s.timezone,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      connected: Boolean(s.apiKey || s.apiSecret || s.webhookUrl),
    }))

    return NextResponse.json({ stores: data })
  } catch (error) {
    console.error('Stores list error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
