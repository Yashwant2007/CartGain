import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const prefsSchema = z.object({
  emailNotifications: z.boolean(),
  recoveryAlerts: z.boolean(),
  dailyReports: z.boolean(),
  weeklyDigest: z.boolean(),
  milestoneAlerts: z.boolean(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { notificationPrefs: true },
  })

  const defaults = {
    emailNotifications: true,
    recoveryAlerts: true,
    dailyReports: true,
    weeklyDigest: false,
    milestoneAlerts: true,
  }

  return NextResponse.json({ prefs: (user?.notificationPrefs as typeof defaults) || defaults })
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = prefsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid preferences' }, { status: 400 })

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: { notificationPrefs: parsed.data },
    select: { notificationPrefs: true },
  })

  return NextResponse.json({ prefs: user.notificationPrefs, message: 'Preferences saved' })
}