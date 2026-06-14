import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
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
      where: { userId: session.user.id },
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
    console.error('Primary store lookup error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
