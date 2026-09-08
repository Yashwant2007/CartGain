import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { purgeStoreData } from '@/lib/data-deletion'

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
      select: { id: true, domain: true, userId: true },
    })

    // Purge each store fully (all child tables + the store row itself).
    for (const store of stores) {
      await purgeStoreData({ id: store.id, domain: store.domain, userId })
    }

    // Delete user-level billing / analytics records.
    await prisma.subscription.deleteMany({ where: { userId } })
    await prisma.analytics.deleteMany({ where: { userId } })
    await prisma.apiKey.deleteMany({ where: { userId } })
    await prisma.invoice.deleteMany({ where: { userId } })

    // Delete user auth/session rows.
    await prisma.session.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })

    // Delete the user row last (raw SQL to avoid Prisma cascade through missing tables).
    await sql('User', 'id', userId)

    const response = NextResponse.json({ message: 'Account deleted' })
    response.cookies.set('next-auth.session-token', '', { maxAge: 0, path: '/', secure: true })

    return response
  } catch (error) {
    console.error('[DELETE_ACCOUNT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
