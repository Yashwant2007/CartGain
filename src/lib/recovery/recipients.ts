// Recipient registry.
//
// Shopify already gives us the customer's name/email/phone on carts,
// checkouts, orders and customer webhooks. The recovery engine stores those on
// each Cart, but WhatsApp needs a durable, store-scoped consent record per
// person — a cart is not an identity, and consent must survive carts, repeat
// checkouts and later orders. This module is the single place that creates and
// merges those records. It NEVER infers WhatsApp consent: consent can only be
// granted explicitly (inbound START, a storefront opt-in form, or a merchant
// attestation recorded from the recipients dashboard).

import prisma from '@/lib/db'
import { isValidEmail } from '@/lib/utils'
import { normalizeWhatsAppPhone } from '@/lib/recovery/eligibility'

export type RecipientContact = {
  storeId: string
  shopifyCustomerId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  seenAt?: Date | null
  source?: string
}

export type RecipientLike = {
  id: string
  storeId: string
  shopifyCustomerId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  consentEmail?: boolean | null
  consentWhatsApp?: boolean | null
  consentSms?: boolean | null
  consentSource?: string | null
  consentAt?: Date | null
  emailConsentAt?: Date | null
  emailConsentSource?: string | null
  whatsappConsentAt?: Date | null
  whatsappConsentSource?: string | null
  optedOutAt?: Date | null
  suppressed?: boolean | null
  lastSeenAt?: Date | null
  lastContactedAt?: Date | null
  lastChannel?: string | null
  createdAt?: Date | null
}

export function normalizeRecipientEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  return trimmed && isValidEmail(trimmed) ? trimmed : null
}

export function normalizeRecipientPhone(phone: string | null | undefined): string | null {
  return normalizeWhatsAppPhone(phone)
}

function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null
  for (const d of dates) {
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d
  }
  return latest
}

function earliestDate(...dates: Array<Date | null | undefined>): Date | null {
  let earliest: Date | null = null
  for (const d of dates) {
    if (d && (!earliest || d.getTime() < earliest.getTime())) earliest = d
  }
  return earliest
}

function firstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function combineIdentities(primary: RecipientLike, all: RecipientLike[]) {
  const anyWhatsAppConsent = all.some((i) => i.consentWhatsApp === true)
  const anyEmailConsent = all.some((i) => i.consentEmail === true)
  const anySmsConsent = all.some((i) => i.consentSms === true)
  const anySuppressed = all.some((i) => i.suppressed === true)
  return {
    shopifyCustomerId: firstString(primary.shopifyCustomerId, ...all.map((i) => i.shopifyCustomerId)),
    name: firstString(primary.name, ...all.map((i) => i.name)),
    email: firstString(primary.email, ...all.map((i) => i.email)),
    phone: firstString(primary.phone, ...all.map((i) => i.phone)),
    consentEmail: anyEmailConsent,
    consentWhatsApp: anyWhatsAppConsent,
    consentSms: anySmsConsent,
    consentSource: firstString(primary.consentSource, ...all.map((i) => i.consentSource)),
    consentAt: earliestDate(primary.consentAt, ...all.map((i) => i.consentAt)),
    emailConsentAt: earliestDate(primary.emailConsentAt, ...all.map((i) => i.emailConsentAt)),
    emailConsentSource: firstString(primary.emailConsentSource, ...all.map((i) => i.emailConsentSource)),
    whatsappConsentAt: earliestDate(primary.whatsappConsentAt, ...all.map((i) => i.whatsappConsentAt)),
    whatsappConsentSource: firstString(primary.whatsappConsentSource, ...all.map((i) => i.whatsappConsentSource)),
    optedOutAt: latestDate(primary.optedOutAt, ...all.map((i) => i.optedOutAt)),
    suppressed: anySuppressed,
    lastSeenAt: latestDate(primary.lastSeenAt, ...all.map((i) => i.lastSeenAt)),
    lastContactedAt: latestDate(primary.lastContactedAt, ...all.map((i) => i.lastContactedAt)),
    lastChannel: firstString(primary.lastChannel, ...all.map((i) => i.lastChannel)),
  }
}

/**
 * Create or update the recipient record for a Shopify contact.
 *
 * Lookup order is Shopify customer id → email → phone, and every matching row
 * is merged. Merging is required because webhooks can arrive in any order: a
 * checkout may create an email-only row before the customer webhook supplies
 * the id and phone. Consent flags are OR-ed, suppression is sticky, and a
 * missing value never overwrites an existing one.
 */
export async function upsertRecipient(input: RecipientContact): Promise<RecipientLike | null> {
  const storeId = input.storeId
  if (!storeId) return null
  const email = normalizeRecipientEmail(input.email)
  const phone = normalizeRecipientPhone(input.phone)
  const shopifyCustomerId = input.shopifyCustomerId ? String(input.shopifyCustomerId).trim() : null
  if (!shopifyCustomerId && !email && !phone) return null

  const OR: Array<Record<string, string>> = []
  if (shopifyCustomerId) OR.push({ shopifyCustomerId })
  if (email) OR.push({ email })
  if (phone) OR.push({ phone })

  const matches: RecipientLike[] = await prisma.customerIdentity.findMany({
    where: { storeId, OR },
    orderBy: { createdAt: 'asc' },
  })

  const primary =
    (shopifyCustomerId && matches.find((m) => m.shopifyCustomerId === shopifyCustomerId)) ||
    (email && matches.find((m) => m.email === email)) ||
    (phone && matches.find((m) => m.phone === phone)) ||
    matches[0]

  const seenAt = input.seenAt || new Date()

  if (!primary) {
    try {
      return (await prisma.customerIdentity.create({
        data: {
          storeId,
          shopifyCustomerId,
          name: input.name?.trim() || null,
          email,
          phone,
          consentSource: input.source || null,
          lastSeenAt: seenAt,
        },
      })) as unknown as RecipientLike
    } catch (err: any) {
      // Concurrent webhook created the same (store, customer) row.
      if (err?.code !== 'P2002' || !shopifyCustomerId) throw err
      const existing = (await prisma.customerIdentity.findUnique({
        where: { storeId_shopifyCustomerId: { storeId, shopifyCustomerId } },
      })) as unknown as RecipientLike | null
      if (!existing) throw err
      return existing
    }
  }

  const merged = combineIdentities(primary, matches.length > 0 ? matches : [primary])
  const duplicateIds = matches.filter((m) => m.id !== primary.id).map((m) => m.id)

  if (duplicateIds.length > 0) {
    // Re-point behavioural journeys before deleting the duplicate identity so
    // they keep a consent record instead of becoming orphaned.
    await prisma.recoveryJourney
      .updateMany({
        where: { customerIdentityId: { in: duplicateIds } },
        data: { customerIdentityId: primary.id },
      })
      .catch(() => {})
    await prisma.customerIdentity.deleteMany({ where: { id: { in: duplicateIds } } })
  }

  return (await prisma.customerIdentity.update({
    where: { id: primary.id },
    data: {
      shopifyCustomerId: shopifyCustomerId || merged.shopifyCustomerId,
      name: input.name?.trim() || merged.name,
      email: email || merged.email,
      phone: phone || merged.phone,
      consentEmail: merged.consentEmail,
      consentWhatsApp: merged.consentWhatsApp,
      consentSms: merged.consentSms,
      consentSource: merged.consentSource,
      consentAt: merged.consentAt,
      emailConsentAt: merged.emailConsentAt,
      emailConsentSource: merged.emailConsentSource,
      whatsappConsentAt: merged.whatsappConsentAt,
      whatsappConsentSource: merged.whatsappConsentSource,
      optedOutAt: merged.optedOutAt,
      suppressed: merged.suppressed,
      lastSeenAt: latestDate(merged.lastSeenAt, seenAt) || seenAt,
      lastContactedAt: merged.lastContactedAt,
      lastChannel: merged.lastChannel,
    },
  })) as unknown as RecipientLike
}

export async function ensureRecipientForCart(
  storeId: string,
  cart: {
    customerId?: string | null
    customerName?: string | null
    customerEmail?: string | null
    customerPhone?: string | null
    updatedAt?: Date | null
  },
): Promise<RecipientLike | null> {
  return upsertRecipient({
    storeId,
    shopifyCustomerId: cart.customerId,
    name: cart.customerName,
    email: cart.customerEmail,
    phone: cart.customerPhone,
    seenAt: cart.updatedAt,
    source: 'shopify_cart',
  })
}

/**
 * Record an explicit opt-in for one or both reminder channels.
 *
 * This is the only code path that can turn `consentWhatsApp` or
 * `consentEmail` on from a storefront/checkout form. Inbound START and merchant
 * attestations may clear a previous STOP; public forms pass
 * `overrideOptOut:false` so a forged submission cannot revive an unsubscribe.
 * Every real opt-in removes the canonical OptOut rows and stamps per-channel
 * provenance so the merchant can answer "when and why did this person consent?".
 */
export async function recordRecipientConsent(input: {
  storeId: string
  email?: string | null
  phone?: string | null
  shopifyCustomerId?: string | null
  name?: string | null
  source: string
  consentEmail?: boolean
  consentWhatsApp?: boolean
  /** Public forms must not silently override an existing STOP/unsubscribe. */
  overrideOptOut?: boolean
  at?: Date
}): Promise<RecipientLike | null> {
  const email = normalizeRecipientEmail(input.email)
  const phone = normalizeRecipientPhone(input.phone)
  const wantsEmail = input.consentEmail === true && Boolean(email)
  const wantsWhatsApp = input.consentWhatsApp === true && Boolean(phone)
  if (!email && !phone) return null
  if (!wantsEmail && !wantsWhatsApp) return null

  const at = input.at || new Date()
  const identity =
    (await upsertRecipient({
      storeId: input.storeId,
      shopifyCustomerId: input.shopifyCustomerId,
      name: input.name,
      email,
      phone,
      seenAt: at,
      source: input.source,
    })) || null
  if (!identity) return null

  const keepSuppressed =
    input.overrideOptOut === false &&
    (identity.suppressed === true || identity.optedOutAt != null)
  const data: Record<string, unknown> = {
    lastSeenAt: at,
    ...(keepSuppressed ? {} : { optedOutAt: null, suppressed: false }),
  }
  if (email) data.email = email
  if (phone) data.phone = phone
  if (wantsEmail) {
    data.consentEmail = true
    data.emailConsentAt = at
    data.emailConsentSource = input.source
  }
  if (wantsWhatsApp) {
    data.consentWhatsApp = true
    data.whatsappConsentAt = at
    data.whatsappConsentSource = input.source
  }
  data.consentAt = identity.consentAt || at
  data.consentSource = identity.consentSource || input.source

  const updated = (await prisma.customerIdentity.update({
    where: { id: identity.id },
    data,
  })) as unknown as RecipientLike

  // OptOut rows store bare digits; the registry stores E.164 with a leading +.
  // Clear both spellings so an explicit re-opt-in is not blocked by a stale
  // STOP row on the next sweep.
  const OR: Array<Record<string, string>> = []
  if (email) OR.push({ email })
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    OR.push({ phone }, ...(digits !== phone ? [{ phone: digits }] : []))
  }
  if (OR.length > 0 && !keepSuppressed) {
    await prisma.optOut.deleteMany({ where: { storeId: input.storeId, OR } }).catch(() => {})
  }

  return updated
}

/**
 * Backwards-compatible WhatsApp-only wrapper used by the inbound START webhook
 * and the merchant attestation action.
 */
export async function recordWhatsAppConsent(input: {
  storeId: string
  phone: string
  email?: string | null
  shopifyCustomerId?: string | null
  name?: string | null
  source: string
  at?: Date
}): Promise<RecipientLike | null> {
  return recordRecipientConsent({
    ...input,
    consentEmail: false,
    consentWhatsApp: true,
  })
}

/**
 * Sticky suppression used by every unsubscribe path (inbound STOP, public
 * opt-out link, merchant suppression). Creates a registry row when the contact
 * is not known yet, so a STOP is never lost just because their cart was already
 * deleted.
 */
export async function suppressRecipient(
  storeId: string,
  contact: { email?: string | null; phone?: string | null },
  at: Date = new Date(),
): Promise<RecipientLike | null> {
  const email = normalizeRecipientEmail(contact.email)
  const phone = normalizeRecipientPhone(contact.phone)
  if (!email && !phone) return null

  const identity =
    (await upsertRecipient({
      storeId,
      email,
      phone,
      seenAt: at,
      source: 'opt_out',
    })) || null
  if (!identity) return null

  return (await prisma.customerIdentity.update({
    where: { id: identity.id },
    data: {
      consentEmail: false,
      consentWhatsApp: false,
      consentSms: false,
      suppressed: true,
      optedOutAt: at,
    },
  })) as unknown as RecipientLike
}

/**
 * Cancel work that has not reached the provider yet. Sent messages are kept for
 * audit; `pending` rows become `skipped` with a reason so the dashboard and the
 * round logic can explain why the customer was not contacted.
 */
export async function cancelPendingRecoveryForCart(
  cartId: string,
  reason: 'purchased' | 'opted_out' | 'suppressed' | 'merchant_disabled',
): Promise<{ messages: number; journeys: number }> {
  const messages = await prisma.message.updateMany({
    where: { cartId, status: 'pending' },
    data: { status: 'skipped', reasonCode: reason },
  })

  const journeys = await prisma.recoveryJourney.updateMany({
    where: {
      cartId,
      status: { in: ['OBSERVED', 'IDENTIFIED', 'ELIGIBILITY_CHECKED', 'SCHEDULED'] },
    },
    data:
      reason === 'purchased'
        ? { status: 'CONVERTED', convertedAt: new Date(), reasonCode: 'purchased' }
        : { status: 'CANCELLED', reasonCode: reason },
  })

  await prisma.recoveryReminder
    .updateMany({
      where: { journey: { cartId }, status: 'pending' },
      data: { status: 'CANCELLED', reasonCode: reason, failedAt: new Date() },
    })
    .catch(() => {})

  return { messages: messages.count, journeys: journeys.count }
}

export async function cancelPendingRecoveryForContact(
  storeId: string,
  contact: { email?: string | null; phone?: string | null },
  reason: 'opted_out' | 'suppressed' = 'opted_out',
): Promise<{ carts: number; messages: number; journeys: number }> {
  const email = normalizeRecipientEmail(contact.email)
  const phone = normalizeRecipientPhone(contact.phone)
  if (!email && !phone) return { carts: 0, messages: 0, journeys: 0 }

  const OR: Array<Record<string, unknown>> = []
  if (email) OR.push({ customerEmail: email })
  // Carts store the phone exactly as Shopify delivered it ("+91 98765 43210"),
  // while opt-out normalisation is digits only. `contains` matches every spacing
  // variant so a STOP cancels pending rows immediately, not on the next sweep.
  if (phone) OR.push({ customerPhone: { contains: phone } })
  const carts = await prisma.cart.findMany({
    where: { storeId, OR },
    select: { id: true },
    take: 500,
  })

  let messages = 0
  let journeys = 0
  for (const cart of carts) {
    const result = await cancelPendingRecoveryForCart(cart.id, reason)
    messages += result.messages
    journeys += result.journeys
  }
  return { carts: carts.length, messages, journeys }
}

export async function markRecipientContacted(input: {
  storeId: string
  email?: string | null
  phone?: string | null
  channel: 'email' | 'whatsapp'
  at?: Date
}): Promise<void> {
  const email = normalizeRecipientEmail(input.email)
  const phone = normalizeRecipientPhone(input.phone)
  const OR: Array<Record<string, string>> = []
  if (email) OR.push({ email })
  if (phone) OR.push({ phone })
  if (OR.length === 0) return
  const at = input.at || new Date()
  await prisma.customerIdentity
    .updateMany({
      where: { storeId: input.storeId, OR },
      data: { lastContactedAt: at, lastChannel: input.channel },
    })
    .catch(() => {})
}
