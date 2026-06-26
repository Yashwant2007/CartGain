import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
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

    const normalizedEmail = email ? email.toLowerCase().trim() : null
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : null

    let optOutData: any = {
      storeId,
      reason: message?.toLowerCase().includes('stop') ? 'STOP command' : 'customer_request',
    }

    if (normalizedEmail) {
      optOutData.email = normalizedEmail
      const existing = await prisma.optOut.findUnique({
        where: { storeId_email: { storeId, email: normalizedEmail } },
      })
      if (!existing) {
        await prisma.optOut.create({ data: optOutData })
      }
    }

    if (normalizedPhone) {
      optOutData.phone = normalizedPhone
      const existing = await prisma.optOut.findUnique({
        where: { storeId_phone: { storeId, phone: normalizedPhone } },
      })
      if (!existing) {
        await prisma.optOut.create({ data: optOutData })
      }
    }

    return NextResponse.json({ success: true, message: 'Opt-out processed' })
  } catch (error) {
    console.error('Opt-out webhook error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
