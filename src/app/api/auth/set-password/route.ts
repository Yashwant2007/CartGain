import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

let bcrypt: any = null
if (typeof window === 'undefined') {
  try {
    bcrypt = require('bcryptjs')
  } catch (e) {
    console.error('Failed to load bcryptjs:', e)
  }
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { email, password } = await request.json()

    if (!email || email !== session.user.email) {
      return NextResponse.json({ message: 'Email mismatch' }, { status: 400 })
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashedPassword },
    })

    return NextResponse.json({ message: 'Password set successfully' })
  } catch (error) {
    console.error('Set password error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
