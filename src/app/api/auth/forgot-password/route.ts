import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendPasswordResetEmail } from '@/lib/services/auth-emails'
import {
  forgotPasswordSchema,
  createErrorResponse,
  createSuccessResponse,
  AUTH_ERROR_CODES,
  generateRandomToken,
  hashToken,
  passwordResetIdentifier,
  PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('auth/forgot-password', {
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000,
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.RATE_LIMITED,
          'Too many password reset attempts. Please try again later.',
          429
        ),
        { status: 429 }
      )
    }

    const body = await request.json()

    const validationResult = forgotPasswordSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.VALIDATION_ERROR,
          'Invalid email address',
          400
        ),
        { status: 400 }
      )
    }

    const email = validationResult.data.email.trim().toLowerCase()

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })

    if (!user) {
      return NextResponse.json(
        createSuccessResponse(
          null,
          'If an account exists with this email, you will receive a reset link.'
        ),
        { status: 200 }
      )
    }

    const resetToken = generateRandomToken()
    const resetTokenExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRES_IN)

    // Only replace this user's outstanding *reset* tokens — never the email
    // verification token (different namespace), so requesting a reset link
    // cannot invalidate a pending verification link.
    await prisma.verificationToken.deleteMany({
      where: { identifier: passwordResetIdentifier(email) },
    })

    await prisma.verificationToken.create({
      data: {
        identifier: passwordResetIdentifier(email),
        // Digest only — the raw token exists solely in the email.
        token: hashToken(resetToken),
        expires: resetTokenExpires,
      },
    })

    const result = await sendPasswordResetEmail(email, resetToken)

    // Always return the same generic 200 even when delivery fails, so a
    // send-failure response can't be used to confirm that an account exists.
    if (!result.success) {
      console.error('Forgot password: failed to send email:', result.error)
    }

    return NextResponse.json(
      createSuccessResponse(
        null,
        'If an account exists with this email, you will receive a reset link.'
      ),
      { status: 200 }
    )
  } catch (error) {
    console.error('Forgot password error:', error)

    return NextResponse.json(
      createErrorResponse(
        AUTH_ERROR_CODES.SERVER_ERROR,
        'An unexpected error occurred. Please try again.',
        500
      ),
      { status: 500 }
    )
  }
}
