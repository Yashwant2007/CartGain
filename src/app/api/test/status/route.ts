import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { isTestEndpointAllowed } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isTestEndpointAllowed()) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
      include: {
        stores: true,
        campaigns: true,
      },
    })

    if (!user) {
      return NextResponse.json({ success: false, message: 'No test user found' })
    }

    const store = user.stores[0]
    if (!store) {
      return NextResponse.json({ success: false, message: 'No test store found' })
    }

    const carts = await prisma.cart.findMany({
      where: { storeId: store.id },
      include: { messages: true },
    })

    const campaign = user.campaigns[0]

    return NextResponse.json({
      success: true,
      store: { id: store.id, name: store.name, domain: store.domain },
      summary: {
        totalCarts: carts.length,
        unrecoveredCarts: carts.filter((c) => !c.isRecovered).length,
        cartsWithMessages: carts.filter((c) => c.messages.length > 0).length,
      },
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to check status' },
      { status: 500 }
    )
  }
}
