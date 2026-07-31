import { NextRequest, NextResponse } from 'next/server'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateSubjectLines } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const aiRate = await checkSimpleRateLimit(`ai_${session.user.id}`)
    if (!aiRate.allowed) {
      return NextResponse.json({ message: 'Too many AI requests. Please try again later.' }, { status: 429 })
    }

    const { cartId, count = 3 } = await request.json()

    if (!cartId || typeof cartId !== 'string') {
      return NextResponse.json({ message: 'cartId is required' }, { status: 400 })
    }

    const parsedCount = Math.min(Math.max(Math.round(Number(count) || 3), 1), 10)

    const cart = await prisma.cart.findUnique({ where: { id: cartId } })
    if (!cart) {
      return NextResponse.json({ message: 'Cart not found' }, { status: 404 })
    }

    const store = await prisma.store.findUnique({ where: { id: cart.storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const items = (Array.isArray(cart.items) ? cart.items : []) as any[]
    const currencySymbol = store.currency === 'INR' ? '₹' : store.currency === 'USD' ? '$' : store.currency || '₹'

    const subjectLines = await generateSubjectLines({
      customerName: cart.customerName || 'Customer',
      items: items.map(i => ({ name: i.name || i.title || '', price: Number(i.price) || 0, quantity: i.quantity || 1 })),
      storeName: store.name,
      total: cart.totalValue,
      currencySymbol,
      cartUrl: '',
    }, parsedCount)

    return NextResponse.json({ subjectLines }, { status: 200 })
  } catch (error) {
    console.error('Subject lines error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}