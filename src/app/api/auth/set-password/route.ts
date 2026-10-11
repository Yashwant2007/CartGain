import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { validatePasswordStrength } from '@/lib/auth-utils'

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
    const rateLimitResult = await checkRateLimit('auth/set-password', {
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ message: 'Too many attempts. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { email, password } = await request.json()

    // The submitted email must match the authenticated session — this endpoint
    // can only ever set a password on the caller's own account.
    if (!email || email !== session.user.email) {
      return NextResponse.json({ message: 'Email mismatch' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    })
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    // This endpoint exists to give Google-only accounts their first password.
    // Once a password exists it must be changed through the authenticated
    // change-password flow (which requires the current password), so a stray or
    // forged request can never silently overwrite existing credentials.
    if (user.password) {
      return NextResponse.json(
        { message: 'A password is already set. Use change password instead.' },
        { status: 400 }
      )
    }

    const passwordError = validatePasswordStrength(password ?? '')
    if (passwordError) {
      return NextResponse.json({ message: passwordError }, { status: 400 })
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
