import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (!store) {
      return NextResponse.json({ message: 'No store found' }, { status: 404 })
    }

    const optOuts = await prisma.optOut.findMany({
      where: { storeId: store.id },
      orderBy: { optedOutAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ optOuts })
  } catch (error) {
    console.error('List opt-outs error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeId, email, phone } = body

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

    const data: any = { storeId, reason: 'customer_request' }
    if (email) data.email = email.toLowerCase().trim()
    if (phone) data.phone = phone.replace(/\D/g, '')

    if (data.email) {
      const existing = await prisma.optOut.findUnique({
        where: { storeId_email: { storeId, email: data.email } },
      })
      if (!existing) {
        await prisma.optOut.create({ data })
      }
    } else if (data.phone) {
      const existing = await prisma.optOut.findUnique({
        where: { storeId_phone: { storeId, phone: data.phone } },
      })
      if (!existing) {
        await prisma.optOut.create({ data })
      }
    }

    return NextResponse.json({ success: true, message: 'Opt-out recorded' })
  } catch (error) {
    console.error('Opt-out error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
