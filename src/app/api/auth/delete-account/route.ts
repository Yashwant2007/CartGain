import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

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

    await prisma.user.delete({ where: { id: userId } })

    const response = NextResponse.json({ message: 'Account deleted' })
    response.cookies.set('next-auth.session-token', '', { maxAge: 0, path: '/' })
    response.cookies.set('__Secure-next-auth.session-token', '', { maxAge: 0, path: '/', secure: true })

    return response
  } catch (error) {
    console.error('[DELETE_ACCOUNT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
