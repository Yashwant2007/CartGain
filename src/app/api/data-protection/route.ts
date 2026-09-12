import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/data-protection?storeId=xxx
// Returns the store's customer-data exports + recent data-access audit logs so
// the merchant can download a customer's data (customers/data_request) or see
// how customer data was accessed. All results are server-scoped to the store.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const [exports, logs] = await Promise.all([
      prisma.customerDataExport.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          shopifyCustomerId: true,
          email: true,
          status: true,
          requestedAt: true,
          createdAt: true,
        },
      }),
      prisma.dataAccessLog.findMany({
        where: { actorId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    return NextResponse.json({
      store: { id: store.id, domain: store.domain },
      exports,
      logs,
    })
  } catch (err) {
    console.error('[DATA_PROTECTION_GET]', err)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}