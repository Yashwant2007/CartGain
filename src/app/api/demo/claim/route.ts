import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPrefs: true },
  })

  const prefs = (existing?.notificationPrefs ?? {}) as Record<string, unknown>
  const alreadyUsed = typeof prefs.demoUsedAt === 'string' ? prefs.demoUsedAt : null

  if (alreadyUsed) {
    return NextResponse.json({ used: true, demoUsedAt: alreadyUsed })
  }

  const now = new Date().toISOString()
  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationPrefs: { ...prefs, demoUsedAt: now } },
  })

  return NextResponse.json({ used: false, demoUsedAt: now })
}