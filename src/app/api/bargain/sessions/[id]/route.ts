import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/bargain/sessions/[id] — full conversation log for a single session
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!bargainSession) {
      return NextResponse.json({ message: 'Session not found' }, { status: 404 })
    }

    // Ownership check
    const store = await prisma.store.findFirst({
      where: { id: bargainSession.storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ session: bargainSession })
  } catch (error) {
    console.error('[BARGAIN_SESSION_DETAIL_GET]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
