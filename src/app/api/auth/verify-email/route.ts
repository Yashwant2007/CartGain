import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { emailVerifyIdentifier, hashToken } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`verify_email_${req.headers.get('x-forwarded-for') || 'unknown'}`)
    if (!rate.allowed) {
      return NextResponse.redirect(new URL('/login?error=Too+many+attempts', req.url))
    }

    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    const rawEmail = searchParams.get('email')

    if (!token || !rawEmail) {
      return NextResponse.redirect(new URL('/login?error=Missing+verification+parameters', req.url))
    }

    const email = rawEmail.trim().toLowerCase()
    // We store only the token digest, so look it up by hash.
    const hashed = hashToken(token)

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token: hashed },
    })

    if (!verificationToken || verificationToken.identifier !== emailVerifyIdentifier(email)) {
      return NextResponse.redirect(new URL('/login?error=Invalid+or+expired+verification+link', req.url))
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.deleteMany({ where: { token: hashed } })
      return NextResponse.redirect(new URL('/login?error=Verification+link+has+expired', req.url))
    }

    // Atomically consume the token: exactly one request may succeed even if the
    // link is opened twice concurrently.
    const consumed = await prisma.verificationToken.deleteMany({ where: { token: hashed } })
    if (consumed.count !== 1) {
      return NextResponse.redirect(new URL('/login?error=Invalid+or+expired+verification+link', req.url))
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.redirect(new URL('/login?error=Account+not+found', req.url))
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    })

    await prisma.store.updateMany({
      where: { userId: user.id },
      data: { isActive: true },
    })

    return NextResponse.redirect(new URL('/login?verified=true', req.url))
  } catch (error) {
    console.error('Email verification error:', error)
    return NextResponse.redirect(new URL('/login?error=Verification+failed', req.url))
  }
}
