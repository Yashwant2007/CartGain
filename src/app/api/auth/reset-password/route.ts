import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { invalidateTokenVersionCache } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendPasswordChangedEmail } from '@/lib/services/auth-emails'
import {
  resetPasswordSchema,
  createErrorResponse,
  createSuccessResponse,
  AUTH_ERROR_CODES,
  passwordResetIdentifier,
  hashToken,
} from '@/lib/auth-utils'

// Server-side only - load bcrypt when needed
let bcrypt: any = null;
if (typeof window === 'undefined') {
  try {
    // eslint-disable-next-line global-require
    bcrypt = require('bcryptjs');
  } catch (e) {
    console.error('Failed to load bcryptjs:', e);
  }
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('auth/reset-password', {
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000,
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.RATE_LIMITED,
          'Too many reset attempts. Please try again later.',
          429
        ),
        { status: 429 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = resetPasswordSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors
      const firstError = Object.values(errors)[0]?.[0] || 'Invalid input'

      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.VALIDATION_ERROR,
          firstError,
          400
        ),
        { status: 400 }
      )
    }

    const { token, password } = validationResult.data
    const email = validationResult.data.email.trim().toLowerCase()

    // Find and validate token. Only a token issued by the reset flow
    // (password-reset: namespace) can reset a password — an email-verification
    // token is rejected here even if it is still valid. The stored token is a
    // digest, so the incoming raw token is hashed before lookup.
    const identifier = passwordResetIdentifier(email)
    const hashed = hashToken(token)
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { identifier_token: { identifier, token: hashed } },
    })

    if (!verificationToken) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.INVALID_TOKEN,
          'Invalid or expired reset link',
          400
        ),
        { status: 400 }
      )
    }

    // Check if token is expired
    if (new Date() > verificationToken.expires) {
      await prisma.verificationToken.deleteMany({
        where: { identifier, token: hashed },
      })

      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.TOKEN_EXPIRED,
          'Reset link has expired. Please request a new one.',
          400
        ),
        { status: 400 }
      )
    }

    // Case-insensitive lookup tolerates accounts stored before normalization.
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })

    if (!user) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.USER_NOT_FOUND,
          'User not found',
          404
        ),
        { status: 404 }
      )
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Atomically consume the token so a link can only be used once, even under
    // concurrent submissions.
    const consumed = await prisma.verificationToken.deleteMany({
      where: { identifier, token: hashed },
    })
    if (consumed.count !== 1) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.INVALID_TOKEN,
          'Invalid or expired reset link',
          400
        ),
        { status: 400 }
      )
    }

    // Update password. Bump tokenVersion so any session an attacker may have
    // established before the reset is revoked.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    })
    invalidateTokenVersionCache(user.id)

    // Out-of-band notification: alert the owner of the account that its
    // password changed (best-effort — never fail the reset on email delivery).
    await sendPasswordChangedEmail(user.email).catch((err) => {
      console.error('Reset password: failed to send notification email:', err)
    })

    return NextResponse.json(
      createSuccessResponse(
        null,
        'Password reset successfully. You can now login with your new password.'
      ),
      { status: 200 }
    )
  } catch (error) {
    console.error('Reset password error:', error)

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
