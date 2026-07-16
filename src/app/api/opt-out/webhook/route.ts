import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { storeId, email, phone, message } = body

    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    if (!email && !phone) {
      return NextResponse.json({ message: 'email or phone is required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    if (store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : null
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : null

    const optOutData: Record<string, unknown> = {
      storeId,
      reason: message?.toLowerCase().includes('stop') ? 'STOP command' : 'customer_request',
    }

    if (normalizedEmail) {
      optOutData.email = normalizedEmail
      const existing = await prisma.optOut.findUnique({
        where: { storeId_email: { storeId, email: normalizedEmail } },
      })
      if (!existing) {
        await prisma.optOut.create({ data: optOutData as any })
      }
    }

    if (normalizedPhone) {
      optOutData.phone = normalizedPhone
      const existing = await prisma.optOut.findUnique({
        where: { storeId_phone: { storeId, phone: normalizedPhone } },
      })
      if (!existing) {
        await prisma.optOut.create({ data: optOutData as any })
      }
    }

    return NextResponse.json({ success: true, message: 'Opt-out processed' })
  } catch {
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
