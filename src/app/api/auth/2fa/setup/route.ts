import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateTotpSecret, generateOtpauthUrl, generateQrCodeUrl } from '@/lib/totp'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.totpEnabled) return NextResponse.json({ error: '2FA is already enabled. Disable it first to reconfigure.' }, { status: 400 })

  const secret = generateTotpSecret()
  const otpauthUrl = generateOtpauthUrl(secret, user.email)
  const qrCodeUrl = generateQrCodeUrl(secret, user.email)

  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } })

  return NextResponse.json({
    secret,
    otpauthUrl,
    qrCodeUrl,
  })
}