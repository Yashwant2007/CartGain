import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/services/auth-emails'
import { createFreeSubscription } from '@/lib/subscription'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import { sendAlertOnError } from '@/lib/alerter'
import { shopDomainCandidates } from '@/lib/stores/resolve-by-domain'
import {
  signupSchema,
  createErrorResponse,
  createSuccessResponse,
  AUTH_ERROR_CODES,
  generateRandomToken,
  hashToken,
  emailVerifyIdentifier,
  deriveStorePlatform,
  deriveSignupDomain,
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

    const { password, name, storeName } = validationResult.data
    const requestedDomain = validationResult.data.storeDomain
    const requestedPlatform = validationResult.data.platform
    // Canonicalize email so "A@B.com" and "a@b.com" cannot create two accounts.
    const email = validationResult.data.email.trim().toLowerCase()

    // Never assume the store is on Shopify. A direct signup is 'custom' (no
    // storefront connected yet) unless the supplied domain is a myshopify.com
    // domain; an explicit platform from the client wins over inference.
    const platform = deriveStorePlatform(requestedDomain, requestedPlatform)
    const storeDomain = deriveSignupDomain(storeName, email, requestedDomain)

    // Case-insensitive duplicate check: the unique index alone would allow a
    // second account differing only by case.
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
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

    // A shop domain is public information; signup must not let a second account
    // claim the domain of a store that is ALREADY connected to CartGain. The
    // connection is the ownership proof (the request itself proves nothing).
    for (const domain of shopDomainCandidates(storeDomain)) {
      const linked = await prisma.store.findFirst({
        where: {
          domain: { equals: domain, mode: 'insensitive' },
          platform: 'shopify',
          apiKey: { not: null },
        },
        select: { id: true },
      })
      if (linked) {
        return NextResponse.json(
          createErrorResponse(
            AUTH_ERROR_CODES.USER_EXISTS,
            'This store is already connected to another CartGain account. Sign in to that account or use a different store.',
            409
          ),
          { status: 409 }
        )
      }
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
            platform,
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

    // Store verification token (use existing VerificationToken model). The
    // identifier is namespaced so this token can only ever verify an email —
    // never reset a password.
    await prisma.verificationToken.create({
      data: {
        identifier: emailVerifyIdentifier(email),
        // Persist only the digest — the raw token lives solely in the email.
        token: hashToken(verificationToken),
        expires: verificationTokenExpires,
      },
    })

    // Create free subscription for the user
    await createFreeSubscription(user.id)

    const emailResult = await sendVerificationEmail(email, verificationToken)

    // A failed verification email used to be swallowed with only a console
    // line, so signup returned "success" while the merchant could never verify
    // (and we never heard about it). Record it, alert, and tell the client so
    // the resend path is surfaced instead of a silent dead end.
    if (!emailResult.success) {
      await captureError({
        level: 'error',
        component: 'auth',
        operation: 'register_verification_email',
        error: new Error(emailResult.error || 'Verification email failed to send'),
        req: request,
        persist: true,
      }).catch(() => {})
      await sendAlertOnError(
        'Registration verification email failed',
        new Error(`${emailResult.error || 'unknown email error'} (channel=${emailResult.channel || 'unknown'})`),
        { email },
      ).catch(() => {})
    }

    await track({
      name: 'cartgain_signup_completed',
      userId: user.id,
      storeId: user.stores[0]?.id,
    })

    // Return user without password
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json(
      createSuccessResponse(
        {
          user: userWithoutPassword,
          verificationRequired: true,
          // false → the client shows a warning and points the merchant at the
          // resend action instead of pretending the email arrived.
          emailSent: emailResult.success,
        },
        emailResult.success
          ? 'Account created successfully. Please verify your email.'
          : 'Account created, but we could not send the verification email. Use "Resend verification email" below.'
      ),
      { status: 201 }
    )
  } catch (error) {
    await captureError({
      level: 'error',
      component: 'auth',
      operation: 'register',
      error,
      req: request,
      persist: true,
    })

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
