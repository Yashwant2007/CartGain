// ── SESSION OWNERSHIP BINDING ────────────────────────────────
// The storefront is anonymous until the caller proves they hold the session's
// buyer identities. A bargain session stores a device fingerprint and Shopify
// cart token; each subsequent offer/accept must reproduce one of them, or hold
// a signed session token. Email/phone are buyer-binding lookup metadata only —
// they are guessable/leakable and must never authorize transcript or code access.
//
// Fully-anonymous sessions (a browser where localStorage is blocked, or an
// API-only caller) have no stored identity to match. Those are NOT left open:
// the caller must present a signed session token (returned once by /start and
// bound to the session id), so a bare sessionId is never enough on its own. A
// valid token is also accepted for identified sessions as a strong fallback.
import { generateSecureToken, verifySecureToken } from '@/lib/links'

export interface SessionBuyerIdentity {
  customerFingerprint?: string | null
  customerEmail?: string | null
  cartToken?: string | null
}

export interface CallerBuyerIdentity {
  customerFingerprint?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  cartToken?: string | null
  tokenOk?: boolean
}

export interface SessionOwnershipResult {
  ok: boolean
  reason?: string
}

const SESSION_TOKEN_PREFIX = 'bsession:'
// Generous ceiling — a session token is only ever handed to the browser that
// started the session, and bargaining sessions are short-lived anyway.
const SESSION_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

/** Sign a tamper-proof token bound to a session id. Null when no secret is set. */
export function signSessionToken(sessionId: string): string | null {
  try {
    return generateSecureToken(`${SESSION_TOKEN_PREFIX}${sessionId}`)
  } catch {
    return null
  }
}

/** True when `token` is a valid, unexpired token for exactly this session id. */
export function verifySessionToken(sessionId: string, token: string | null | undefined): boolean {
  if (!token) return false
  const data = verifySecureToken(token, SESSION_TOKEN_MAX_AGE_MS)
  return data === `${SESSION_TOKEN_PREFIX}${sessionId}`
}

export function sessionIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  const data = verifySecureToken(token, SESSION_TOKEN_MAX_AGE_MS)
  return data?.startsWith(SESSION_TOKEN_PREFIX) ? data.slice(SESSION_TOKEN_PREFIX.length) : null
}

export function assertSessionOwnership(
  session: SessionBuyerIdentity,
  caller: CallerBuyerIdentity,
): SessionOwnershipResult {
  const storedFingerprint = session.customerFingerprint ?? null
  const storedCart = session.cartToken ?? null

  if (!storedFingerprint && !storedCart) {
    return caller.tokenOk
      ? { ok: true }
      : { ok: false, reason: 'This bargain session can only be continued from the browser that started it.' }
  }

  const matches =
    (storedFingerprint != null && caller.customerFingerprint === storedFingerprint) ||
    (storedCart != null && caller.cartToken === storedCart)

  if (matches || caller.tokenOk) {
    return { ok: true }
  }

  return { ok: false, reason: 'This bargain session is bound to another buyer. Open the link from the URL you used to start it.' }
}
