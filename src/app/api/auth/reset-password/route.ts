import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  resetPasswordSchema,
  createErrorResponse,
  createSuccessResponse,
  AUTH_ERROR_CODES,
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

    const { token, email, password } = validationResult.data

    // Find and validate token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier: email,
          token,
        },
      },
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
      // Delete expired token
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: email,
            token,
          },
        },
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

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
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

    // Update password and delete token
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: email,
            token,
          },
        },
      }),
    ])

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
