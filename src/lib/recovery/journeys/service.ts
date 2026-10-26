import prisma from '@/lib/db'
import { isValidEmail } from '@/lib/utils'

function normalizePhoneLocal(phone: string): string | null {
  if (typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

export type JourneyType = 'product_browse' | 'add_to_cart' | 'checkout_abandon' | 'payment_failed'

export async function resolveCustomerIdentity(opts: {
  storeId: string
  shopifyCustomerId?: string | null
  email?: string | null
  phone?: string | null
  sessionId?: string | null
}) {
  const { storeId, shopifyCustomerId, email, phone } = opts
  const normEmail = email && isValidEmail(email) ? email.toLowerCase().trim() : null
  const normPhone = phone ? normalizePhoneLocal(phone) : null

  if (shopifyCustomerId) {
    const existing = await prisma.customerIdentity.findUnique({
      where: { storeId_shopifyCustomerId: { storeId, shopifyCustomerId } },
    })
    if (existing) {
      await prisma.customerIdentity.update({
        where: { id: existing.id },
        data: { email: normEmail || existing.email, phone: normPhone || existing.phone, lastSeenAt: new Date() },
      })
      return existing
    }
    return prisma.customerIdentity.create({
      data: {
        storeId,
        shopifyCustomerId,
        email: normEmail,
        phone: normPhone,
      },
    })
  }

  if (normEmail) {
    const existing = await prisma.customerIdentity.findFirst({
      where: { storeId, email: normEmail },
    })
    if (existing) {
      await prisma.customerIdentity.update({
        where: { id: existing.id },
        data: { phone: normPhone || existing.phone, lastSeenAt: new Date() },
      })
      return existing
    }
    return prisma.customerIdentity.create({
      data: { storeId, email: normEmail, phone: normPhone },
    })
  }

  if (normPhone) {
    const existing = await prisma.customerIdentity.findFirst({
      where: { storeId, phone: normPhone },
    })
    if (existing) {
      await prisma.customerIdentity.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      })
      return existing
    }
    return prisma.customerIdentity.create({
      data: { storeId, phone: normPhone },
    })
  }

  return null
}

export async function canSendToIdentity(
  identity: any,
  channel?: 'email' | 'whatsapp' | 'sms',
): Promise<{ ok: boolean; reason?: string }> {
  if (!identity) return { ok: false, reason: 'no_identity' }
  if (identity.suppressed) return { ok: false, reason: 'suppressed' }
  if (identity.optedOutAt) return { ok: false, reason: 'opted_out' }
  if (channel === 'whatsapp' && identity.consentWhatsApp !== true) {
    return { ok: false, reason: 'no_whatsapp_consent' }
  }
  if (channel === 'email' && identity.consentEmail !== true) {
    return { ok: false, reason: 'no_email_consent' }
  }
  if (channel === 'sms' && identity.consentSms !== true) {
    return { ok: false, reason: 'no_sms_consent' }
  }
  if (
    channel === undefined &&
    identity.consentWhatsApp !== true &&
    identity.consentEmail !== true &&
    identity.consentSms !== true
  ) {
    return { ok: false, reason: 'no_consent' }
  }
  return { ok: true }
}

export async function createOrUpdateJourney(opts: {
  storeId: string
  journeyType: JourneyType
  customerIdentityId?: string | null
  sessionId?: string | null
  cartId?: string | null
  checkoutId?: string | null
  productId?: string | null
  priority?: number
  delayMinutes?: number
  metadata?: any
}) {
  const delayMinutes = opts.delayMinutes ?? 30
  const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000)

  if (opts.cartId) {
    const existing = await prisma.recoveryJourney.findFirst({
      where: {
        storeId: opts.storeId,
        cartId: opts.cartId,
        journeyType: opts.journeyType,
        status: { in: ['OBSERVED', 'IDENTIFIED', 'ELIGIBILITY_CHECKED', 'SCHEDULED'] },
      },
    })
    if (existing) {
      await prisma.recoveryJourney.update({
        where: { id: existing.id },
        data: {
          customerIdentityId: opts.customerIdentityId || existing.customerIdentityId,
          status: existing.status === 'OBSERVED' ? 'IDENTIFIED' : existing.status,
          scheduledFor: existing.scheduledFor || scheduledFor,
          priority: Math.max(existing.priority, opts.priority ?? 0),
          metadata: opts.metadata || existing.metadata,
          updatedAt: new Date(),
        },
      })
      return existing
    }
  }

  if (opts.checkoutId) {
    const existing = await prisma.recoveryJourney.findFirst({
      where: {
        storeId: opts.storeId,
        checkoutId: opts.checkoutId,
        journeyType: { in: ['checkout_abandon', 'payment_failed'] },
        status: { in: ['OBSERVED', 'IDENTIFIED', 'ELIGIBILITY_CHECKED', 'SCHEDULED'] },
      },
    })
    if (existing) {
      await prisma.recoveryJourney.update({
        where: { id: existing.id },
        data: { priority: Math.max(existing.priority, 10), updatedAt: new Date() },
      })
      return existing
    }
  }

  return prisma.recoveryJourney.create({
    data: {
      storeId: opts.storeId,
      journeyType: opts.journeyType,
      customerIdentityId: opts.customerIdentityId || null,
      sessionId: opts.sessionId || null,
      cartId: opts.cartId || null,
      checkoutId: opts.checkoutId || null,
      productId: opts.productId || null,
      priority: opts.priority ?? 0,
      status: opts.customerIdentityId ? 'IDENTIFIED' : 'OBSERVED',
      scheduledFor,
      metadata: opts.metadata || {},
    },
  })
}
