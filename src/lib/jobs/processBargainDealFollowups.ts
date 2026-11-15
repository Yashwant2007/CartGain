import prisma from '@/lib/db'
import { sendEmail } from '@/lib/services/email'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { canSendToIdentity } from '@/lib/recovery/journeys/service'
import { currencySymbolFor } from '@/lib/bargain/i18n'
import {
  normalizeDelays,
  dueStage,
  dealFollowupText,
  dealFollowupSubject,
  dealFollowupHtml,
} from '@/lib/bargain/deal-followup'

const MAX_SESSIONS_PER_STORE = 25

/**
 * Phase 5 — remind shoppers who accepted a bargain but never paid, while the
 * locked price is still valid. Idempotent per (session, stage, channel); the
 * authoritative deal state (`status='accepted'`, `purchasedAt=null`, not
 * expired) is re-checked before every send. Email is preferred; WhatsApp is
 * only used inside Meta's 24h customer-service window with explicit consent.
 * Never extends a deal's validity.
 */
export async function processBargainDealFollowups(limitStores = 50) {
  const now = new Date()
  const configs = await prisma.bargainConfig.findMany({
    where: { dealFollowupEnabled: true },
    select: { storeId: true, dealFollowupDelaysMinutes: true, dealFollowupMax: true },
    take: limitStores,
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const config of configs) {
    const delays = normalizeDelays(config.dealFollowupDelaysMinutes, config.dealFollowupMax)
    const minDelay = delays[0]
    const sessions = await prisma.bargainSession.findMany({
      where: {
        storeId: config.storeId,
        status: 'accepted',
        purchasedAt: null,
        expiredAt: { gt: now },
        createdAt: { lte: new Date(now.getTime() - minDelay * 60000) },
      },
      include: { store: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_SESSIONS_PER_STORE,
    })

    for (const session of sessions) {
      const priorFollowups = await prisma.bargainDealFollowup.findMany({
        where: { sessionId: session.id },
        select: { stage: true },
      })
      const sentStages = priorFollowups.map((f) => f.stage)
      const stage = dueStage({ acceptedAt: session.createdAt, now, delays, sentStages })
      if (stage == null) continue

      // Re-verify the deal is still redeemable and unpaid right before sending.
      const fresh = await prisma.bargainSession.findUnique({
        where: { id: session.id },
        select: { status: true, purchasedAt: true, expiredAt: true, purchaseUrl: true, finalPrice: true, customerEmail: true, customerPhone: true, cartToken: true, storeId: true },
      })
      if (!fresh || fresh.status !== 'accepted' || fresh.purchasedAt || fresh.expiredAt <= now || !fresh.purchaseUrl) {
        skipped++
        continue
      }

      const email = fresh.customerEmail?.trim() || null
      const phone = fresh.customerPhone?.trim() || null
      const identity = await prisma.customerIdentity.findFirst({
        where: { storeId: session.storeId, ...(email ? { email } : phone ? { phone } : { id: '__none__' }) },
        select: { id: true, consentEmail: true, consentWhatsApp: true, emailConsentBasis: true, suppressed: true, optedOutAt: true, lastInboundAt: true },
      })

      const name = await resolveName(session.storeId, fresh.cartToken, email)
      const ctx = {
        name,
        productTitle: null,
        storeName: session.store?.name ?? null,
        currencySymbol: currencySymbolFor(session.store?.currency ?? 'INR'),
        price: fresh.finalPrice,
        url: fresh.purchaseUrl,
        expiresAt: fresh.expiredAt,
      }

      let channel: 'email' | 'whatsapp' | null = null
      if (email) {
        const ok = identity ? (await canSendToIdentity(identity, 'email')).ok : true
        if (ok) channel = 'email'
      }
      if (!channel && phone) {
        const within24h = identity?.lastInboundAt ? now.getTime() - identity.lastInboundAt.getTime() < 24 * 3600 * 1000 : false
        const ok = identity ? (await canSendToIdentity(identity, 'whatsapp')).ok : false
        if (ok && within24h) channel = 'whatsapp'
      }
      if (!channel) {
        skipped++
        continue
      }

      // Idempotency: claim the (session, stage, channel) slot first.
      let followupId: string
      try {
        const row = await prisma.bargainDealFollowup.create({
          data: { storeId: session.storeId, sessionId: session.id, stage, channel, status: 'sent', detail: {} },
        })
        followupId = row.id
      } catch (e: any) {
        if (e?.code === 'P2002') {
          skipped++
          continue
        }
        throw e
      }

      try {
        if (channel === 'email' && email) {
          const res = await sendEmail({
            to: email,
            subject: dealFollowupSubject(stage, ctx),
            html: dealFollowupHtml(stage, ctx),
            text: dealFollowupText(stage, ctx),
          })
          if (!res.success) throw new Error(res.error || 'email failed')
          await prisma.bargainDealFollowup.update({ where: { id: followupId }, data: { providerId: res.messageId ?? null } })
        } else if (channel === 'whatsapp' && phone) {
          const res: any = await sendWhatsAppMessage({ to: phone, content: dealFollowupText(stage, ctx) })
          if (res?.success === false) throw new Error(res?.error || 'whatsapp failed')
          await prisma.bargainDealFollowup.update({ where: { id: followupId }, data: { providerId: res?.messageId ?? null } })
        }
        sent++
      } catch (err: any) {
        failed++
        await prisma.bargainDealFollowup.update({
          where: { id: followupId },
          data: { status: 'failed', detail: { error: String(err?.message ?? err).slice(0, 300) } },
        })
      }
    }
  }

  return { sent, failed, skipped, stores: configs.length }
}

async function resolveName(storeId: string, cartToken: string | null, email: string | null): Promise<string | null> {
  try {
    if (email) {
      const id = await prisma.customerIdentity.findFirst({ where: { storeId, email }, select: { name: true } })
      if (id?.name) return id.name
    }
    if (cartToken) {
      const cart = await prisma.cart.findUnique({
        where: { storeId_cartId: { storeId, cartId: cartToken } },
        select: { customerName: true },
      })
      if (cart?.customerName) return cart.customerName
    }
  } catch {
    // best-effort
  }
  return null
}
