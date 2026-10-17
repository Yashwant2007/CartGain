// ── SESSION OWNERSHIP BINDING ────────────────────────────────
// The storefront is anonymous until the caller proves they hold the session's
// buyer identities. A bargain session stores up to three identity handles the
// widget sends (device fingerprint, email, Shopify cart token). Each subsequent
// offer/accept must reproduce at least one of them, otherwise the request is a
// hijack — anyone who obtains a sessionId could otherwise burn attempts, read
// the transcript, or lock a deal + pull the discount code.
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
  cartToken?: string | null
  // Result of verifySessionToken(sessionId, presentedToken). Kept as a boolean
  // so this module stays pure and free of secret/env handling.
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

export function assertSessionOwnership(
  session: SessionBuyerIdentity,
  caller: CallerBuyerIdentity,
): SessionOwnershipResult {
  const storedFingerprint = session.customerFingerprint ?? null
  const storedEmail = session.customerEmail ?? null
  const storedCart = session.cartToken ?? null

  // Fully anonymous / legacy session: nothing stored to match, so the signed
  // session token is the ONLY credential that proves the caller was the one who
  // started it. A bare sessionId is rejected.
  if (!storedFingerprint && !storedEmail && !storedCart) {
    return caller.tokenOk
      ? { ok: true }
      : { ok: false, reason: 'This bargain session can only be continued from the browser that started it.' }
  }

  const hasAnyStored = storedFingerprint != null || storedEmail != null || storedCart != null
  const matches =
    (storedFingerprint != null && caller.customerFingerprint === storedFingerprint) ||
    (storedEmail != null && caller.customerEmail != null && caller.customerEmail === storedEmail) ||
    (storedCart != null && caller.cartToken === storedCart)

  if ((hasAnyStored && matches) || caller.tokenOk) {
    return { ok: true }
  }

  return { ok: false, reason: 'This bargain session is bound to another buyer. Open the link from the URL you used to start it.' }
}
