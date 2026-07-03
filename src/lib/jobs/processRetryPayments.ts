import prisma from '@/lib/db'
import { getPendingRetries, markPaymentRecovered } from '@/lib/payments/recovery'
import { getMerchantConfig } from '@/lib/rto/config'
import { generateSecureToken } from '@/lib/links'
import { sendSMS } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { sendEmail } from '@/lib/services/email'
import { acquireLock, releaseLock } from '@/lib/job-lock'
import { DEFAULT_RETRY_SCHEDULE } from '@/lib/payments/types'
import type { FailureCategory } from '@/lib/payments/types'

interface RetryResult {
  processed: number
  messagesSent: number
  messagesFailed: number
}

export async function processRetryPayments(): Promise<RetryResult> {
  const lockKey = 'process-retry-payments'
  if (!(await acquireLock(lockKey))) {
    console.log('Retry payments job already running — skipping concurrent execution')
    return { processed: 0, messagesSent: 0, messagesFailed: 0 }
  }

  let messagesSent = 0
  let messagesFailed = 0
  const processed = new Set<string>()

  try {
    const pending = await getPendingRetries()
    const now = new Date()

    for (const entry of pending) {
      if (processed.has(entry.id)) continue
      processed.add(entry.id)

      const campaign = await prisma.paymentRecoveryCampaign.findUnique({
        where: { id: entry.id },
        include: {
          attempt: {
            include: {
              paymentRecoveryCampaigns: true,
            },
          },
        },
      })

      if (!campaign || campaign.nextRetryAt === null || campaign.nextRetryAt > now) continue
      if (campaign.retryCount >= (DEFAULT_RETRY_SCHEDULE[campaign.attempt.failureCategory as FailureCategory]?.maxRetries ?? 1)) continue

      const config = await getMerchantConfig(campaign.attempt.merchantId)
      if (!config.paymentRecoveryEnabled) continue

      const schedule = DEFAULT_RETRY_SCHEDULE[campaign.attempt.failureCategory as FailureCategory] ?? DEFAULT_RETRY_SCHEDULE.unknown
      const nextRetryAt = new Date(now.getTime() + schedule.delayMinutes * 60 * 1000)
      const token = generateSecureToken(`${campaign.attempt.id}:retry:${campaign.retryCount + 1}`)
      const resumeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/r/resume-payment/${token}`

      const channels = config.paymentChannelPriority.length > 0
        ? config.paymentChannelPriority
        : ['whatsapp', 'sms']

      const category = campaign.attempt.failureCategory as FailureCategory
      const customerFriendlyMessages: Record<string, string> = {
        bank_downtime: 'Your bank is back online. Complete your payment now — your order is still reserved!',
        upi_timeout: 'Your UPI payment timed out. Tap here to retry or choose a different method.',
        otp_failure: 'The OTP didn\'t arrive. Request a new OTP and complete your payment.',
        insufficient_funds: 'Your payment is still pending. Add funds and complete your order.',
        user_dropped: 'You dropped off during payment. Your cart is saved — complete it here:',
        gateway_error: 'We had a technical glitch. Everything should work now — please try again.',
        unknown: 'Your payment didn\'t go through earlier. Click here to retry:',
      }

      let sent = false
      for (const channel of channels) {
        if (sent) break

        const message = customerFriendlyMessages[category] || customerFriendlyMessages.unknown
        const finalMsg = `${message} ${resumeUrl}`

        if (channel === 'whatsapp' || channel === 'sms') {
          const store = await prisma.store.findUnique({ where: { id: campaign.attempt.merchantId } })
          if (!store) continue

          const orderRef = campaign.attempt.orderRef
          const cart = await prisma.cart.findFirst({
            where: { storeId: campaign.attempt.merchantId, cartId: orderRef },
          })
          const phone = cart?.customerPhone
          if (!phone) continue

          if (channel === 'whatsapp') {
            const result = await sendWhatsAppMessage({ to: phone, content: finalMsg })
            sent = result.success
          } else {
            const result = await sendSMS({ to: phone, body: finalMsg })
            sent = result.success
          }
        } else if (channel === 'email') {
          const store = await prisma.store.findUnique({ where: { id: campaign.attempt.merchantId } })
          if (!store) continue

          const cart = await prisma.cart.findFirst({
            where: { storeId: campaign.attempt.merchantId, cartId: campaign.attempt.orderRef },
          })
          const email = cart?.customerEmail
          if (!email) continue

          const result = await sendEmail({
            to: email,
            subject: 'Reminder: Resume Your Payment',
            html: `<p>${message}</p><p><a href="${resumeUrl}">Complete Payment Now</a></p>`,
          })
          sent = result.success
        }
      }

      await prisma.paymentRecoveryCampaign.update({
        where: { id: campaign.id },
        data: {
          retryCount: { increment: 1 },
          nextRetryAt,
          resumeLinkToken: token,
          status: sent ? 'sent' : campaign.status,
        },
      })

      if (sent) messagesSent++
      else messagesFailed++
    }

    return { processed: processed.size, messagesSent, messagesFailed }
  } catch (error) {
    console.error('Retry payments job error:', error)
    return { processed: processed.size, messagesSent, messagesFailed }
  } finally {
    await releaseLock(lockKey)
  }
}
