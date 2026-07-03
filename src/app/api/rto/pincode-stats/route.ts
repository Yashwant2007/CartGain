import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const pincode = searchParams.get('pincode')

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const store = await prisma.store.findFirst({ where: { id: storeId, userId: session.user.id } })
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    if (pincode) {
      const stats = await prisma.pincodeStats.findUnique({
        where: { storeId_pincode: { storeId, pincode } },
      })
      const globalStats = await prisma.pincodeStats.findUnique({
        where: { storeId_pincode: { storeId: null as never, pincode } },
      })

      return NextResponse.json({ merchant: stats, global: globalStats })
    }

    const allStats = await prisma.pincodeStats.findMany({
      where: { storeId },
      orderBy: { codRtoRate: 'desc' },
      take: 50,
    })

    return NextResponse.json({ pincodes: allStats, total: allStats.length })
  } catch (error) {
    console.error('Pincode stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch pincode stats' }, { status: 500 })
  }
}
