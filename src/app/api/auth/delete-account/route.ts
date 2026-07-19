import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

async function safeDelete(table: string, where: string, value: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE ${where} = $1`, value)
  } catch {}
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    const stores = await prisma.store.findMany({
      where: { userId },
      select: { id: true },
    })
    const storeIds = stores.map(s => s.id)

    for (const storeId of storeIds) {
      await safeDelete('BargainMessage', '"sessionId"', storeId)
      await safeDelete('BargainSession', '"storeId"', storeId)
      await safeDelete('BargainProduct', '"storeId"', storeId)
      await safeDelete('BargainConfig', '"storeId"', storeId)
      await prisma.campaign.deleteMany({ where: { storeId } })
    }

    // Delete stores
    for (const storeId of storeIds) {
      try {
        await prisma.store.delete({ where: { id: storeId } })
      } catch {}
    }

    // Delete user-level records
    await prisma.campaign.deleteMany({ where: { userId } })
    await prisma.analytics.deleteMany({ where: { userId } })
    await prisma.subscription.deleteMany({ where: { userId } })
    await prisma.session.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })

    await prisma.user.delete({ where: { id: userId } })

    const response = NextResponse.json({ message: 'Account deleted' })
    response.cookies.set('next-auth.session-token', '', { maxAge: 0, path: '/', secure: true })

    return response
  } catch (error) {
    console.error('[DELETE_ACCOUNT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
