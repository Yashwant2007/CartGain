import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/services/email'
import { createFreeSubscription } from '@/lib/subscription'
import {
  signupSchema,
  createErrorResponse,
  createSuccessResponse,
  AUTH_ERROR_CODES,
  generateRandomToken,
  VERIFICATION_EXPIRES_IN,
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
    // Check rate limiting
    const rateLimitResult = await checkRateLimit('auth/register', {
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000, // 15 minutes
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.RATE_LIMITED,
          rateLimitResult.message || 'Too many registration attempts. Please try again later.',
          429
        ),
        { status: 429 }
      )
    }

    const body = await request.json()
    
    // Validate input with zod
    const validationResult = signupSchema.safeParse(body)
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

    const { email, password, name, storeName, storeDomain } = validationResult.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        createErrorResponse(
          AUTH_ERROR_CODES.USER_EXISTS,
          'An account with this email already exists',
          409
        ),
        { status: 409 }
      )
    }

    // Generate email verification token
    const verificationToken = generateRandomToken()
    const verificationTokenExpires = new Date(Date.now() + VERIFICATION_EXPIRES_IN)

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user and store in transaction
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        emailVerified: null, // Not verified yet
        stores: {
          create: {
            name: storeName,
            domain: storeDomain,
            platform: 'shopify',
            currency: 'USD',
            isActive: false, // Inactive until verified
          },
        },
        // Store verification token (you'd normally use a separate table)
        // For now, we'll handle this with the VerificationToken model in schema
      },
      include: {
        stores: true,
      },
    })

    // Store verification token (use existing VerificationToken model)
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: verificationToken,
        expires: verificationTokenExpires,
      },
    })

    // Create free subscription for the user
    await createFreeSubscription(user.id)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const verifyLink = `${appUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`

    await sendEmail({
      to: email,
      subject: 'Verify your email address',
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
            <h1>Welcome to CartGain!</h1>
            <p style="text-align: center; color: #94a3b8;">Click the button below to verify your email and start recovering abandoned carts.</p>
            <a href="${verifyLink}" class="btn">Verify Email</a>
            <p style="text-align: center; font-size: 12px; color: #64748b;">Or copy this link: ${verifyLink}</p>
            <div class="footer"><p>This link expires in 24 hours.</p></div>
          </div>
        </body>
        </html>
      `,
      text: `Verify your email: ${verifyLink}`,
    })

    // Return user without password
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json(
      createSuccessResponse(
        {
          user: userWithoutPassword,
          verificationRequired: true,
        },
        'Account created successfully. Please verify your email.'
      ),
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    
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
