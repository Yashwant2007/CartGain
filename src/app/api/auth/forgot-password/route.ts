import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/services/email'
import {
  forgotPasswordSchema,
  createErrorResponse,
  createSuccessResponse,
  AUTH_ERROR_CODES,
  generateRandomToken,
  PASSWORD_RESET_EXPIRES_IN,
} from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Check rate limiting - stricter for password reset
    const rateLimitResult = await checkRateLimit('auth/forgot-password', {
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000, // 1 hour
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

    // Validate input
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

    const { email } = validationResult.data

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    })

    // Don't reveal if email exists (security best practice)
    if (!user) {
      return NextResponse.json(
        createSuccessResponse(
          null,
          'If an account exists with this email, you will receive a reset link.'
        ),
        { status: 200 }
      )
    }

    // Generate reset token
    const resetToken = generateRandomToken()
    const resetTokenExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRES_IN)

    // Store reset token
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    })

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: resetToken,
        expires: resetTokenExpires,
      },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const resetLink = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`

    await sendEmail({
      to: email,
      subject: 'Reset your password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
            .container { max-width: 480px; margin: 40px auto; padding: 32px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; }
            .logo { font-size: 24px; font-weight: bold; color: #22d3ee; text-align: center; margin-bottom: 24px; }
            h1 { font-size: 20px; text-align: center; margin-bottom: 16px; }
            .btn { display: block; width: 200px; margin: 24px auto; padding: 12px 24px; background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: 600; }
            .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 32px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">CartGain</div>
            <h1>Reset your password</h1>
            <p style="text-align: center; color: #94a3b8;">Click the button below to reset your password. This link expires in 1 hour.</p>
            <a href="${resetLink}" class="btn">Reset Password</a>
            <p style="text-align: center; font-size: 12px; color: #64748b;">Or copy this link: ${resetLink}</p>
            <div class="footer"><p>If you didn't request this, you can safely ignore this email.</p></div>
          </div>
        </body>
        </html>
      `,
      text: `Reset your password: ${resetLink}`,
    })

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
