import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { verifyTotpCode } from '@/lib/totp'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  code: z.string().length(6),
})

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('auth-2fa-verify', {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid code — must be 6 digits' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (!user.totpSecret) return NextResponse.json({ error: 'No 2FA setup in progress. Start setup first.' }, { status: 400 })

    if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
      return NextResponse.json({ error: 'Invalid code. Try again.' }, { status: 400 })
    }

    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } })

    return NextResponse.json({ success: true, message: '2FA enabled successfully' })
  } catch (error) {
    console.error('2FA verify error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}