import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/services/auth-emails'
import {
  forgotPasswordSchema,
  generateRandomToken,
  hashToken,
  emailVerifyIdentifier,
  VERIFICATION_EXPIRES_IN,
} from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

// POST /api/auth/resend-verification — re-send the email-verification link to an
// account that has not verified yet. Always returns the same generic response so
// it cannot be used to probe which emails exist.
export async function POST(request: NextRequest) {
  const rate = await checkSimpleRateLimit(
    `resend_verify_${request.headers.get('x-forwarded-for') || 'unknown'}`,
  )
  if (!rate.allowed) {
    return NextResponse.json(
      { error: true, message: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: true, message: 'Invalid request.' }, { status: 400 })
  }

  const parsed = forgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: true, message: 'Please enter a valid email address.' }, { status: 400 })
  }

  const email = parsed.data.email.trim().toLowerCase()
  const generic = { error: false, message: 'If an unverified account exists with this email, a new verification link has been sent.' }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  })

  // Do not reveal existence or verification state.
  if (!user || user.emailVerified) {
    return NextResponse.json(generic, { status: 200 })
  }

  const token = generateRandomToken()
  const expires = new Date(Date.now() + VERIFICATION_EXPIRES_IN)

  await prisma.verificationToken.deleteMany({
    where: { identifier: emailVerifyIdentifier(email) },
  })
  await prisma.verificationToken.create({
    data: {
      identifier: emailVerifyIdentifier(email),
      // Digest only — the raw token exists solely in the email.
      token: hashToken(token),
      expires,
    },
  })

  const result = await sendVerificationEmail(email, token)
  if (!result.success) {
    console.error('Resend verification: failed to send email:', result.error)
    return NextResponse.json({ error: true, message: 'Failed to send email. Please try again later.' }, { status: 500 })
  }

  return NextResponse.json(generic, { status: 200 })
}
