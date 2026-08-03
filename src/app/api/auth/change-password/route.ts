import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { validatePasswordStrength } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('auth-change-password', {
      maxAttempts: 5,
      windowMs: 10 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Invalid input' }, { status: 400 })

    const passwordError = validatePasswordStrength(parsed.data.newPassword)
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (!user.password) return NextResponse.json({ error: 'No password set. Use forgot password instead.' }, { status: 400 })

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.password)
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })

    const hashed = await bcrypt.hash(parsed.data.newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })

    return NextResponse.json({ success: true, message: 'Password updated successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
