import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const store = await prisma.store.findFirst({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        domain: true,
      },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found' }, { status: 404 })
    }

    return NextResponse.json({ store })
  } catch (error) {
    console.error('Primary store lookup error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
