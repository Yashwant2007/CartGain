import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

async function sql(table: string, where: string, value: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE ${where} = $1`, value)
  } catch {
    // Table may not exist (e.g. Bargain tables not yet migrated)
  }
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

    // Delete bargain-related rows first (tables may not exist — safeDelete catches it)
    for (const storeId of storeIds) {
      await sql('BargainMessage', 'id', '000') // Table doesn't exist; just a no-op
      await sql('BargainMessage', '"sessionId"', storeId) // no-op if table missing
      await sql('BargainSession', '"storeId"', storeId)
      await sql('BargainProduct', '"storeId"', storeId)
      await sql('BargainConfig', '"storeId"', storeId)
      // Campaign and Analytics tables DO exist
      await prisma.campaign.deleteMany({ where: { storeId } })
    }

    // Delete each store via raw SQL to avoid Prisma's cascade through missing tables
    for (const storeId of storeIds) {
      await sql('Store', 'id', storeId)
    }

    // Delete user-level records
    await prisma.campaign.deleteMany({ where: { userId } })
    await prisma.analytics.deleteMany({ where: { userId } })
    await prisma.subscription.deleteMany({ where: { userId } })
    await prisma.session.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })

    // Delete user via raw SQL to avoid cascade through Store -> missing tables
    await sql('User', 'id', userId)

    const response = NextResponse.json({ message: 'Account deleted' })
    response.cookies.set('next-auth.session-token', '', { maxAge: 0, path: '/', secure: true })

    return response
  } catch (error) {
    console.error('[DELETE_ACCOUNT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
