import prisma from '@/lib/db'
import { canSendToIdentity } from '@/lib/recovery/journeys/service'
import { sendEmail } from '@/lib/services/email'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { buildOptOutUrl } from '@/lib/opt-out'
import { isWithinQuietHours } from '@/lib/conversation/variety'
import { loadStoreVoiceSettings } from '@/lib/conversation/store'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function storefrontBase(store: any): string {
  const domain = String(store?.domain || '').trim()
  if (!domain) return 'https://cart-gain.com'
  if (/^https?:\/\//i.test(domain)) return domain.replace(/\/$/, '')
  if (domain.includes('.')) return `https://${domain}`
  return `https://${domain}.myshopify.com`
}

export async function processRecoveryJourneys(limit = 50) {
  const now = new Date()
  const journeys = await prisma.recoveryJourney.findMany({
    where: {
      status: { in: ['IDENTIFIED', 'ELIGIBILITY_CHECKED', 'SCHEDULED'] },
      scheduledFor: { lte: now },
    },
    include: { store: true },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
    take: limit,
  })

  let sent = 0
  let failed = 0
  let suppressed = 0

  for (const journey of journeys) {
    try {
      if (journey.cartId) {
        const cart = await prisma.cart.findUnique({ where: { id: journey.cartId }, include: { recoveredCart: true } })
        if (cart?.recoveredCart) {
          await prisma.recoveryJourney.update({
            where: { id: journey.id },
            data: { status: 'CONVERTED', convertedAt: new Date(), reasonCode: 'already_converted' },
          })
          suppressed++
          continue
        }
        // @ts-ignore
        if ((cart as any)?.status === 'purchased') {
          await prisma.recoveryJourney.update({
            where: { id: journey.id },
            data: { status: 'CONVERTED', convertedAt: new Date(), reasonCode: 'already_purchased' },
          })
          suppressed++
          continue
        }
      }

      let identity: any = null
      if (journey.customerIdentityId) {
        identity = await prisma.customerIdentity.findUnique({ where: { id: journey.customerIdentityId } })
      }

      const gate = await canSendToIdentity(identity)
      if (!gate.ok) {
        await prisma.recoveryJourney.update({
          where: { id: journey.id },
          data: { status: 'SUPPRESSED', reasonCode: gate.reason },
        })
        suppressed++
        continue
      }

      const store: any = journey.store
      if (!store?.isActive) {
        await prisma.recoveryJourney.update({
          where: { id: journey.id },
          data: { status: 'SUPPRESSED', reasonCode: 'store_inactive' },
        })
        suppressed++
        continue
      }

      const voice = await loadStoreVoiceSettings(store.id).catch(() => null)
      if (
        voice?.quietHoursStart != null &&
        voice?.quietHoursEnd != null &&
        isWithinQuietHours(new Date(), { start: voice.quietHoursStart, end: voice.quietHoursEnd })
      ) {
        await prisma.recoveryJourney.update({
          where: { id: journey.id },
          data: { scheduledFor: new Date(Date.now() + 60 * 60 * 1000), status: 'SCHEDULED' },
        })
        continue
      }

      const email = identity?.email
      const phone = identity?.phone

      if (!email && !phone) {
        await prisma.recoveryJourney.update({
          where: { id: journey.id },
          data: { status: 'SUPPRESSED', reasonCode: 'no_contact' },
        })
        suppressed++
        continue
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com').replace(/\/$/, '')
      const meta = journey.metadata && typeof journey.metadata === 'object'
        ? (journey.metadata as Record<string, any>)
        : {}
      const productTitle = typeof meta.productTitle === 'string' && meta.productTitle.trim()
        ? meta.productTitle.trim().slice(0, 200)
        : null
      const productUrl = safeHttpUrl(meta.productUrl)
      const cartUrl = safeHttpUrl(meta.cartUrl)
      const productImage = safeHttpUrl(meta.productImage)
      const fallbackCartUrl = `${storefrontBase(store)}/cart`
      const destination = cartUrl || productUrl || fallbackCartUrl
      const firstName = (identity?.name || 'there').split(' ')[0]
      const subject = productTitle
        ? `Still thinking about ${productTitle}?`
        : `Your cart is still saved at ${store.name}`
      const bodyText = productTitle
        ? `Still thinking about ${productTitle}? Pick up where you left off: ${destination}`
        : `Your cart is still saved at ${store.name}. Finish when you are ready: ${destination}`

      let didSend = false
      const whatsappGate = await canSendToIdentity(identity, 'whatsapp')
      if (phone && whatsappGate.ok) {
        try {
          const result = await sendWhatsAppMessage({
            to: phone,
            templateName: process.env.WHATSAPP_TEMPLATE_REMINDER || 'cart_reminders',
            templateParams: {
              header: {
                type: 'image',
                imageUrl:
                  productImage ||
                  process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL ||
                  'https://cart-gain.com/logo.png',
              },
              body: [
                firstName,
                productTitle
                  ? `Still thinking about ${productTitle}? Your cart is saved.`
                  : 'Your cart is still saved — finish your order when you are ready.',
                `Continue: ${destination}`,
              ],
            },
          })
          if (result.success || result.messageId) {
            didSend = true
            await prisma.recoveryReminder.create({
              data: {
                journeyId: journey.id,
                storeId: store.id,
                channel: 'whatsapp',
                status: 'sent',
                scheduledFor: now,
                sentAt: new Date(),
                providerId: result.messageId || null,
              },
            })
          }
        } catch (e) {
          console.warn('journey whatsapp send failed')
        }
      }

      const emailGate = await canSendToIdentity(identity, 'email')
      if (!didSend && email && emailGate.ok) {
        try {
          const optOutUrl = buildOptOutUrl(appUrl, { storeId: store.id, email })
          const result = await sendEmail({
            to: email,
            subject,
            html: `<p>Hi ${escapeHtml(firstName)}, ${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(destination)}">Pick up where you left off</a></p><p><a href="${escapeHtml(optOutUrl)}">Unsubscribe</a></p>`,
          } as any)
          if (result.success || result.messageId) {
            didSend = true
            await prisma.recoveryReminder.create({
              data: {
                journeyId: journey.id,
                storeId: store.id,
                channel: 'email',
                status: 'sent',
                scheduledFor: now,
                sentAt: new Date(),
                providerId: result.messageId || null,
              },
            })
          }
        } catch (e) {
          console.warn('journey email send failed')
        }
      }

      if (didSend) {
        await prisma.recoveryJourney.update({
          where: { id: journey.id },
          data: { status: 'SENT', reasonCode: null, lastProcessedAt: new Date() },
        })
        sent++
      } else {
        await prisma.recoveryJourney.update({
          where: { id: journey.id },
          data: { status: 'FAILED', reasonCode: 'send_failed', lastProcessedAt: new Date() },
        })
        failed++
      }
    } catch (err) {
      console.error('journey processing error:', err)
      failed++
    }
  }

  return { sent, failed, suppressed, processed: journeys.length }
}
