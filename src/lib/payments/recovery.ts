import prisma from '@/lib/db'
import { classifyFailure } from './failure-classifier'
import { generateSecureToken } from '@/lib/links'
import { sendSMS } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { sendEmail } from '@/lib/services/email'
import { getMerchantConfig } from '@/lib/rto/config'
import { logDataAccess } from '@/lib/data-protection'
import type { GatewayPaymentEvent, FailureCategory } from './types'
import { DEFAULT_RETRY_SCHEDULE } from './types'

export async function handlePaymentFailure(
  event: GatewayPaymentEvent,
  customerContact?: { email?: string; phone?: string }
): Promise<void> {
  const config = await getMerchantConfig(event.merchantId)
  if (!config.paymentRecoveryEnabled) return

  const { category, retryable } = classifyFailure(event.failureReasonRaw || '', event.method)

  const attempt = await prisma.paymentAttempt.upsert({
    where: { gatewayEventId: event.gatewayEventId },
    create: {
      merchantId: event.merchantId,
      orderRef: event.orderRef,
      gateway: event.gateway,
      gatewayEventId: event.gatewayEventId,
      amount: event.amount,
      currency: event.currency,
      status: 'failed',
      failureReasonRaw: event.failureReasonRaw,
      failureCategory: category,
      retryable,
      gatewayResponse: (event.gatewayResponse ?? undefined) as any,
    },
    update: {},
  })

  await logDataAccess({
    actorType: 'system',
    action: 'payment_failure',
    resourceType: 'payment_attempt',
    resourceId: attempt.id,
    actorId: event.merchantId,
    purpose: 'Payment failure recovery',
    metadata: { gateway: event.gateway, category, retryable, amount: event.amount, orderRef: event.orderRef },
  })

  if (!retryable) return

  const schedule = DEFAULT_RETRY_SCHEDULE[category as FailureCategory] || DEFAULT_RETRY_SCHEDULE.unknown
  const now = new Date()
  const nextRetryAt = new Date(now.getTime() + schedule.delayMinutes * 60 * 1000)
  const token = generateSecureToken(`${attempt.id}:${event.orderRef}`)
  const resumeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/r/resume-payment/${token}`

  const channels = config.paymentChannelPriority.length > 0
    ? config.paymentChannelPriority
    : customerContact?.phone ? ['whatsapp', 'sms'] : ['email']

  const customerFriendlyMessages: Record<string, string> = {
    bank_downtime: 'Your bank was temporarily unavailable. Please try again — your cart is saved!',
    upi_timeout: 'Your UPI payment timed out. Try again or use a different payment method.',
    otp_failure: 'The OTP did not go through. Request a new OTP and complete your payment.',
    insufficient_funds: 'Insufficient balance. Add funds and complete your payment.',
    user_dropped: 'You dropped off during payment. Complete it here:',
    gateway_error: 'A technical error occurred. Please try again.',
    unknown: 'Your payment did not go through. Click here to retry:',
  }

  for (const channel of channels) {
    let sent = false
    const message = customerFriendlyMessages[category] || customerFriendlyMessages.unknown
    const finalMsg = `${message} ${resumeUrl}`

    if ((channel === 'whatsapp' || channel === 'sms') && customerContact?.phone) {
      if (channel === 'whatsapp') {
        const result = await sendWhatsAppMessage({ to: customerContact.phone, content: finalMsg })
        sent = result.success
      } else {
        const result = await sendSMS({ to: customerContact.phone, body: finalMsg })
        sent = result.success
      }
    } else if (channel === 'email' && customerContact?.email) {
      const result = await sendEmail({
        to: customerContact.email,
        subject: 'Resume Your Payment',
        html: `<p>${message}</p><a href="${resumeUrl}">Complete Payment</a>`,
      })
      sent = result.success
    }

    await prisma.paymentRecoveryCampaign.create({
      data: {
        attemptId: attempt.id,
        channel,
        status: sent ? 'sent' : 'failed',
        resumeLinkToken: token,
        nextRetryAt,
      },
    })

    await logDataAccess({
      actorType: 'system',
      action: sent ? 'recovery_message_sent' : 'recovery_message_failed',
      resourceType: 'payment_recovery_campaign',
      resourceId: attempt.id,
      actorId: event.merchantId,
      purpose: 'Payment failure recovery',
      metadata: { channel, category, nextRetryAt: nextRetryAt.toISOString() },
    })

    if (sent) break
  }
}

export async function markPaymentRecovered(resumeLinkToken: string): Promise<boolean> {
  const campaign = await prisma.paymentRecoveryCampaign.findUnique({ where: { resumeLinkToken } })
  if (!campaign || campaign.status === 'recovered') return false

  await prisma.$transaction([
    prisma.paymentRecoveryCampaign.update({
      where: { resumeLinkToken },
      data: { status: 'recovered', recoveredAt: new Date() },
    }),
    prisma.paymentAttempt.update({
      where: { id: campaign.attemptId },
      data: { status: 'success' },
    }),
  ])

  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: campaign.attemptId } })
  await logDataAccess({
    actorType: 'system',
    action: 'payment_recovered',
    resourceType: 'payment_recovery_campaign',
    resourceId: campaign.attemptId,
    actorId: attempt?.merchantId ?? 'unknown',
    purpose: 'Payment failure recovery',
    metadata: { channel: campaign.channel, resumeLinkToken },
  })

  return true
}

export async function getPendingRetries(): Promise<Array<{ id: string; nextRetryAt: Date }>> {
  const now = new Date()
  const campaigns = await prisma.paymentRecoveryCampaign.findMany({
    where: {
      status: 'sent',
      nextRetryAt: { lte: now },
      retryCount: { lt: 5 },
    },
    select: { id: true, nextRetryAt: true },
  })

  return campaigns.map(c => ({ id: c.id, nextRetryAt: c.nextRetryAt! }))
}
