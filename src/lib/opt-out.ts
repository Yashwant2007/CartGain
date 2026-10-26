import prisma from '@/lib/db'
import { generateSecureToken, verifySecureToken } from '@/lib/links'
import { cancelPendingRecoveryForContact, suppressRecipient } from '@/lib/recovery/recipients'

// ── Opt-out: normalization + enforcement ──
//
// Every outbound recovery/nudge channel must consult the same opt-out table so
// a customer who unsubscribes is never re-contacted on ANY channel. The stored
// forms are canonical: emails lowercased+trimmed, phones digits-only — matching
// exactly how POST /api/opt-out persists them.

export function normalizeOptOutEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizeOptOutPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export type OptOutContact = { email?: string | null; phone?: string | null }

// Persists an opt-out for a store, normalizing the contact and refusing to
// create a duplicate for an already-recorded identity. Shared by the public
// opt-out endpoint and the inbound WhatsApp STOP webhook so both channels write
// the exact same canonical row. A contact with neither email nor phone is a
// no-op (there is nothing to suppress).
export async function recordOptOut(
  storeId: string,
  contact: OptOutContact,
  reason: string = 'customer_request',
): Promise<void> {
  const email = contact.email ? normalizeOptOutEmail(contact.email) : null
  const phone = contact.phone ? normalizeOptOutPhone(contact.phone) : null
  if (!email && !phone) return

  // Record each identifier we hold. The old else-if stopped at email, so a
  // contact with both email and phone was never on the phone opt-out list and a
  // later phone-only capture could still be messaged.
  if (email) {
    const existing = await prisma.optOut.findUnique({
      where: { storeId_email: { storeId, email } },
    })
    if (!existing) await prisma.optOut.create({ data: { storeId, reason, email } })
  }
  if (phone) {
    const existing = await prisma.optOut.findUnique({
      where: { storeId_phone: { storeId, phone } },
    })
    if (!existing) await prisma.optOut.create({ data: { storeId, reason, phone } })
  }

  // Opt-out is not just a list row: it must revoke the stored consent and stop
  // any reminder that has not reached the provider. Without this a queued
  // WhatsApp row would still be sent after a STOP, because the live job only
  // checked the OptOut table when it started a round.
  await suppressRecipient(storeId, { email, phone }, new Date()).catch((err) => {
    console.warn(`[opt-out] could not suppress recipient ${email || phone}:`, err?.message || err)
  })
  await cancelPendingRecoveryForContact(storeId, { email, phone }, 'opted_out').catch((err) => {
    console.warn(`[opt-out] could not cancel pending recovery for ${email || phone}:`, err?.message || err)
  })
}

export async function isContactOptedOut(storeId: string, contact: OptOutContact): Promise<boolean> {
  const email = contact.email ? normalizeOptOutEmail(contact.email) : null
  const phone = contact.phone ? normalizeOptOutPhone(contact.phone) : null
  if (!email && !phone) return false

  const OR: Array<Record<string, string>> = []
  if (email) OR.push({ email })
  if (phone) OR.push({ phone })

  const hit = await prisma.optOut.findFirst({ where: { storeId, OR }, select: { id: true } })
  return !!hit
}

// ── Signed opt-out tokens ──
//
// The opt-out endpoint accepts unauthenticated requests from email/message
// links. Without proof those links are legitimate, anyone could POST a victim's
// email + a storeId to silently suppress that store's recovery for the victim —
// or mass-opt-out a competitor's entire list. The link therefore carries an
// HMAC-signed token bound to (storeId, email, phone); the route refuses to act
// on anything it cannot verify.

export type OptOutTokenPayload = { storeId: string; email?: string | null; phone?: string | null }

export function signOptOutToken(payload: OptOutTokenPayload): string {
  return generateSecureToken(
    JSON.stringify({
      storeId: payload.storeId,
      email: payload.email ? normalizeOptOutEmail(payload.email) : null,
      phone: payload.phone ? normalizeOptOutPhone(payload.phone) : null,
    }),
  )
}

export function verifyOptOutToken(token: string): OptOutTokenPayload | null {
  // Long-lived: an unsubscribe link in an old email must still work.
  const data = verifySecureToken(token, 1000 * 60 * 60 * 24 * 365)
  if (!data) return null
  try {
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.storeId !== 'string' || !parsed.storeId) return null
    const email = typeof parsed.email === 'string' && parsed.email ? parsed.email : null
    const phone = typeof parsed.phone === 'string' && parsed.phone ? parsed.phone : null
    if (!email && !phone) return null
    return { storeId: parsed.storeId, email, phone }
  } catch {
    return null
  }
}

export function buildOptOutUrl(baseUrl: string, payload: OptOutTokenPayload): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/opt-out?t=${encodeURIComponent(signOptOutToken(payload))}`
}
