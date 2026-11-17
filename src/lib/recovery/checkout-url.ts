/**
 * Shopify abandoned-checkout recovery URL handling.
 *
 * `AbandonedCheckout.abandonedCheckoutUrl` moves behind Level 2 protected
 * customer data access on 2026-11-23. Everything here treats the URL as
 * optional: a missing or denied URL must never break checkout discovery,
 * recovery scheduling, or messaging.
 *
 * Security notes:
 *  - The full recovery URL contains a checkout secret. It is persisted only
 *    AES-256-GCM encrypted (if at all); only the non-secret checkout token is
 *    used to build resume links.
 *  - URLs are never returned to the storefront, analytics, AI prompts, or
 *    arbitrary logs.
 *  - Validation allows Shopify's custom storefront domains (not only
 *    *.myshopify.com) but requires HTTPS and the documented checkout/recover
 *    path shape. No URL is ever fabricated or guessed.
 */
import { encrypt, decrypt } from '@/lib/encryption'

export const RECOVERY_URL_STATUSES = [
  'AVAILABLE',
  'MISSING',
  'ACCESS_DENIED',
  'RETRIEVAL_FAILED',
  'EXPIRED_OR_INVALID',
  'NOT_REQUIRED',
] as const

export type RecoveryUrlStatus = (typeof RECOVERY_URL_STATUSES)[number]

export const STORE_URL_ACCESS_STATES = ['UNKNOWN', 'AVAILABLE', 'ACCESS_DENIED', 'RETRIEVAL_FAILED'] as const
export type StoreUrlAccessState = (typeof STORE_URL_ACCESS_STATES)[number]

const TOKEN_RE = /^[A-Za-z0-9_-]{4,200}$/
const MAX_URL_LENGTH = 2048

/** Treat legacy rows (no status recorded) as usable when they have a token. */
export function normalizeRecoveryUrlStatus(value: unknown): RecoveryUrlStatus {
  if (typeof value !== 'string' || !value) return 'AVAILABLE'
  return (RECOVERY_URL_STATUSES as readonly string[]).includes(value)
    ? (value as RecoveryUrlStatus)
    : 'RETRIEVAL_FAILED'
}

export function normalizeStoreUrlAccessState(value: unknown): StoreUrlAccessState {
  if (typeof value !== 'string' || !value) return 'UNKNOWN'
  return (STORE_URL_ACCESS_STATES as readonly string[]).includes(value)
    ? (value as StoreUrlAccessState)
    : 'UNKNOWN'
}

export type RecoveryUrlValidation =
  | { valid: true; token: string }
  | { valid: false; reason: 'missing' | 'malformed' | 'insecure' | 'wrong_path' | 'invalid_token' }

/**
 * Validate a Shopify recovery URL and extract its checkout token.
 *
 * Accepts `https://<store>/<locale?>/checkouts/<token>/recover?key=...` and
 * URLs that carry an explicit `token` query parameter. Rejects anything that
 * is not HTTPS, contains credentials, is unreasonably long, or does not look
 * like a checkout recovery URL. The host is intentionally not pinned to
 * *.myshopify.com because Shopify stores may use verified custom domains.
 */
export function validateShopifyRecoveryUrl(input: unknown): RecoveryUrlValidation {
  if (typeof input !== 'string' || !input.trim()) return { valid: false, reason: 'missing' }
  const raw = input.trim()
  if (raw.length > MAX_URL_LENGTH) return { valid: false, reason: 'malformed' }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  if (url.protocol !== 'https:') return { valid: false, reason: 'insecure' }
  if (url.username || url.password) return { valid: false, reason: 'malformed' }

  const explicit = url.searchParams.get('token')
  if (explicit && TOKEN_RE.test(explicit)) return { valid: true, token: explicit }

  const segments = url.pathname.split('/').filter(Boolean)
  const recoverIndex = segments.findIndex((part) => part.toLowerCase() === 'recover')
  if (recoverIndex < 1) return { valid: false, reason: 'wrong_path' }

  const candidate = decodeURIComponent(segments[recoverIndex - 1] || '')
  if (!TOKEN_RE.test(candidate)) return { valid: false, reason: 'invalid_token' }
  return { valid: true, token: candidate }
}

/** Extract only the checkout token; returns null for missing/invalid URLs. */
export function extractCheckoutTokenFromRecoveryUrl(input: unknown): string | null {
  const result = validateShopifyRecoveryUrl(input)
  return result.valid ? result.token : null
}

/**
 * A cart can resume the original Shopify checkout only when its stored token
 * came from a usable recovery URL. A missing/denied URL must fall back to the
 * storefront instead of producing `/cart/<invalid-token>`.
 */
export function cartHasResumeToken(cart: {
  cartId?: string | null
  recoveryUrlStatus?: string | null
}): boolean {
  const status = normalizeRecoveryUrlStatus(cart?.recoveryUrlStatus)
  if (status !== 'AVAILABLE' && status !== 'NOT_REQUIRED') return false
  const token = (cart?.cartId || '').trim()
  return TOKEN_RE.test(token)
}

/** Encrypt a recovery URL for storage. Returns null when encryption is off. */
export function encryptRecoveryUrlForStorage(url: string): string | null {
  try {
    return encrypt(url)
  } catch {
    // ENCRYPTION_KEY missing/misconfigured. Keep discovery working; the URL is
    // not persisted, only its token/status.
    return null
  }
}

/** Decrypt a stored recovery URL. Returns null on any failure (never throws). */
export function decryptRecoveryUrlFromStorage(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = decrypt(value)
    return validateShopifyRecoveryUrl(url).valid ? url : null
  } catch {
    return null
  }
}

/** Classify a GraphQL failure as a Level 2 access denial vs a transient error. */
export function isRecoveryUrlAccessDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /ACCESS_DENIED|access denied|protected customer data|not approved|permission/i.test(message)
}

export function countRecoveryUrlStatuses(
  statuses: Array<RecoveryUrlStatus | null | undefined>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const status of statuses) {
    const key = normalizeRecoveryUrlStatus(status)
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}
