import { NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'

// The live session cookie name set by NextAuth (see the cookies config in
// src/lib/auth.ts). Must match exactly, including the Partitioned (CHIPS)
// attribute so the session survives inside Shopify's cross-site admin iframe.
export const SESSION_COOKIE_NAME = 'next-auth.session-token'

export interface MintSessionPayload {
  sub: string
  email: string
  name?: string | null
  storeId: string
  requirePassword: boolean
  tokenVersion: number
}

// Mint a NextAuth JWT session cookie by hand. Used both by the Shopify OAuth
// callback (install / connect) and by the embedded session-token exchange, so
// the Partitioned attribute and token shape can never drift between the two.
export async function mintNextAuthSessionCookie(
  res: NextResponse,
  payload: MintSessionPayload
): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET not configured')

  const sessionToken = await encode({
    token: {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? undefined,
      storeId: payload.storeId,
      requirePassword: payload.requirePassword,
      // Stamp the account's token version so this session is subject to the same
      // revocation check as normal sign-ins (auth.ts jwt callback only enforces
      // it when tokenVersion is a number).
      tokenVersion: payload.tokenVersion,
    },
    secret,
    maxAge: 30 * 24 * 60 * 60, // matches session.maxAge in src/lib/auth.ts
  })

  // Build the Set-Cookie by hand to guarantee the Partitioned attribute; the
  // NextResponse cookies API types don't expose it consistently across versions.
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${30 * 24 * 60 * 60}`
  )
}
