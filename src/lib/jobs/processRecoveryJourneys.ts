import prisma from '@/lib/db'
import { canSendToIdentity } from '@/lib/recovery/journeys/service'
import { sendEmail } from '@/lib/services/email'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { buildOptOutUrl } from '@/lib/opt-out'
import { isWithinQuietHours } from '@/lib/conversation/variety'
import { loadStoreVoiceSettings } from '@/lib/conversation/store'

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
      if (voice?.quietHoursStart && voice?.quietHoursEnd && false) {
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

      let didSend = false
      const whatsappGate = await canSendToIdentity(identity, 'whatsapp')
      if (phone && whatsappGate.ok) {
        try {
          const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com').replace(/\/$/, '')
          const firstName = (identity?.name || 'there').split(' ')[0]
          const result = await sendWhatsAppMessage({
            to: phone,
            templateName: process.env.WHATSAPP_TEMPLATE_REMINDER || 'cart_reminders',
            templateParams: {
              header: {
                type: 'image',
                imageUrl:
                  process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || 'https://cart-gain.com/logo.png',
              },
              body: [
                firstName,
                'Your cart is still saved — finish your order when you are ready.',
                `${appUrl}/cart/${journey.cartId || ''}`,
              ],
            },
          })
          if ((result as any)?.success || (result as any)?.messageId || (result as any)?.wamid) {
            didSend = true
            await prisma.recoveryReminder.create({
              data: {
                journeyId: journey.id,
                storeId: store.id,
                channel: 'whatsapp',
                status: 'sent',
                scheduledFor: now,
                sentAt: new Date(),
                providerId: (result as any).messageId || (result as any).wamid || null,
              },
            })
          }
        } catch (e) {
          console.warn('journey whatsapp send failed')
        }
      }

      if (!didSend && email) {
        try {
          const optOutUrl = buildOptOutUrl(store.id, email)
          const result = await sendEmail({
            to: email,
            subject: 'Still thinking about it?',
            html: `<p>Hi there, you left items in your cart at ${store.name}. <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com'}/cart/${journey.cartId || ''}">Complete your purchase</a></p><p><a href="${optOutUrl}">Unsubscribe</a></p>`,
          } as any)
          if ((result as any)?.success || (result as any)?.messageId || (result as any)?.id) {
            didSend = true
            await prisma.recoveryReminder.create({
              data: {
                journeyId: journey.id,
                storeId: store.id,
                channel: 'email',
                status: 'sent',
                scheduledFor: now,
                sentAt: new Date(),
                providerId: (result as any).messageId || (result as any).id || null,
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
          data: { status: 'SENT', lastProcessedAt: new Date() },
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
