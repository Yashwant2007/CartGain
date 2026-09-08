// ── SESSION OWNERSHIP BINDING ────────────────────────────────
// The storefront is anonymous until the caller proves they hold the session's
// buyer identities. A bargain session stores up to three identity handles the
// widget sends (device fingerprint, email, Shopify cart token). Each subsequent
// offer/accept must reproduce at least one of them, otherwise the request is a
// hijack — anyone who obtains a sessionId could otherwise burn attempts, read
// the transcript, or lock a deal + pull the discount code.
//
// Sessions created before the binding columns existed (or fully anonymous
// buyers) have no stored identity and cannot be verified; those are treated as
// any-caller so the feature keeps working for transition-era sessions.

export interface SessionBuyerIdentity {
  customerFingerprint?: string | null
  customerEmail?: string | null
  cartToken?: string | null
}

export interface CallerBuyerIdentity {
  customerFingerprint?: string | null
  customerEmail?: string | null
  cartToken?: string | null
}

export interface SessionOwnershipResult {
  ok: boolean
  reason?: string
}

export function assertSessionOwnership(
  session: SessionBuyerIdentity,
  caller: CallerBuyerIdentity,
): SessionOwnershipResult {
  const storedFingerprint = session.customerFingerprint ?? null
  const storedEmail = session.customerEmail ?? null
  const storedCart = session.cartToken ?? null

  // Fully anonymous / legacy session: nobody can be matched — allow (cannot
  // do better than the start-route single-active-session-per-product guard).
  if (!storedFingerprint && !storedEmail && !storedCart) {
    return { ok: true }
  }

  const hasAnyStored = storedFingerprint != null || storedEmail != null || storedCart != null
  const matches =
    (storedFingerprint != null && caller.customerFingerprint === storedFingerprint) ||
    (storedEmail != null && caller.customerEmail != null && caller.customerEmail === storedEmail) ||
    (storedCart != null && caller.cartToken === storedCart)

  if (hasAnyStored && matches) {
    return { ok: true }
  }

  return { ok: false, reason: 'This bargain session is bound to another buyer. Open the link from the URL you used to start it.' }
}