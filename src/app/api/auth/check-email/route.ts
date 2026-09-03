import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/check-email
 *
 * Lightweight discovery endpoint used by the unified login page to determine
 * the next step after a merchant enters their email. Returns only whether an
 * account exists and which primary auth method it uses — never reveals the
 * existence/non-existence of an account to rate-limited scanners because a
 * valid email is always required.
 *
 * Rate-limited to 20 requests per minute per IP to prevent enumeration at
 * scale while keeping the UX fast for legitimate users.
 */
export async function POST(request: Request) {
  const rate = await checkSimpleRateLimit(
    `check_email_${request.headers.get('x-forwarded-for') || 'unknown'}`,
  )
  if (!rate.allowed) {
    return NextResponse.json(
      { error: true, message: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    )
  }

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: true, message: 'Invalid request.' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: true, message: 'Please enter a valid email address.' },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      emailVerified: true,
      accounts: {
        select: { provider: true },
        take: 1,
      },
    },
  })

  if (!user) {
    // Never leak account existence — always return the same shape.
    return NextResponse.json({
      exists: false,
      hasPassword: false,
      hasGoogle: false,
      emailVerified: false,
    })
  }

  const providers = user.accounts.map((a) => a.provider)
  const hasGoogle = providers.includes('google')
  const hasPassword = !hasGoogle || providers.length > 1

  return NextResponse.json({
    exists: true,
    hasPassword,
    hasGoogle,
    emailVerified: user.emailVerified !== null,
  })
}
