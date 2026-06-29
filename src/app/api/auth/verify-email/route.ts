import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    const email = searchParams.get('email')

    if (!token || !email) {
      return NextResponse.redirect(new URL('/login?error=Missing+verification+parameters', req.url))
    }

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    })

    if (!verificationToken || verificationToken.identifier !== email) {
      return NextResponse.redirect(new URL('/login?error=Invalid+or+expired+verification+link', req.url))
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } })
      return NextResponse.redirect(new URL('/login?error=Verification+link+has+expired', req.url))
    }

    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    })

    await prisma.store.updateMany({
      where: {
        userId: (await prisma.user.findUnique({ where: { email }, select: { id: true } }))!.id,
      },
      data: { isActive: true },
    })

    await prisma.verificationToken.delete({ where: { token } })

    return NextResponse.redirect(new URL('/login?verified=true', req.url))
  } catch (error) {
    console.error('Email verification error:', error)
    return NextResponse.redirect(new URL('/login?error=Verification+failed', req.url))
  }
}
