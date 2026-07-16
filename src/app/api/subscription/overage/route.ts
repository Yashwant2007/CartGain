import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { enabled } = await req.json()
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const existing = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    const subscription = await prisma.subscription.update({
      where: { id: existing.id },
      data: { overageEnabled: enabled },
    })

    return NextResponse.json({
      overageEnabled: subscription.overageEnabled,
      overageMessages: subscription.overageMessages,
    })
  } catch (error) {
    console.error('Overage toggle error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
