import prisma from '@/lib/db'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { sendSMS, sanitizePhoneNumber } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { FREE_CARTS_THRESHOLD, PLANS } from '@/lib/payment'

const PAID_PLANS = Object.values(PLANS).filter(p => p.price > 0).map(p => p.id)

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  AED: 'د.إ',
  CNY: '¥',
  KRW: '₩',
  BRL: 'R$',
}

function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency?.toUpperCase()] || currency || '₹'
}

type ProcessResult = {
  processedCarts: number
  messagesSent: number
  messagesFailed: number
}

export async function processAbandonedCarts(limit = 25): Promise<ProcessResult> {
  let messagesSent = 0
  let messagesFailed = 0
  const processedCartIds = new Set<string>()

  const campaigns = await prisma.campaign.findMany({
    where: { isActive: true },
    include: { store: true },
  })

  for (const campaign of campaigns) {
    const { store } = campaign

    // Check subscription & free cart limit
    const subscription = await prisma.subscription.findFirst({
      where: { userId: campaign.userId },
    })

    const isPaidUser = subscription && PAID_PLANS.includes(subscription.plan) && subscription.status === 'active'

    if (!isPaidUser) {
      const recoveredCount = await prisma.recoveredCart.count({
        where: { storeId: store.id },
      })

      if (recoveredCount >= FREE_CARTS_THRESHOLD) {
        console.log(`⏸️ Store ${store.id}: ${recoveredCount} carts recovered (limit ${FREE_CARTS_THRESHOLD}). Free trial exhausted, skipping.`)
        continue
      }
    }

    const channels = campaign.channels.length > 0 ? campaign.channels : ['email']
    const sendDelayMs = campaign.sendDelay * 60 * 1000
    const followUpDelayMs = campaign.followUpDelay * 60 * 1000
    const maxMessages = Math.min(channels.length, campaign.maxFollowUps + 1)
    const currencySymbol = getCurrencySymbol(store.currency)

    const carts = await prisma.cart.findMany({
      where: {
        storeId: store.id,
        isRecovered: false,
        abandonedAt: { lte: new Date(Date.now() - sendDelayMs) },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
      take: limit,
      orderBy: { abandonedAt: 'asc' },
    })

    for (const cart of carts) {
      if (processedCartIds.has(cart.id)) continue

      const step = cart.messages.length
      if (step >= maxMessages) continue

      const requiredDelayMs = sendDelayMs + step * followUpDelayMs
      if (Date.now() - cart.abandonedAt.getTime() < requiredDelayMs) continue

      const channel = channels[step % channels.length]

      const alreadySentOnChannel = cart.messages.some(m => m.channel === channel)
      if (alreadySentOnChannel) continue

      if (channel === 'email' && !cart.customerEmail) continue
      if ((channel === 'sms' || channel === 'whatsapp') && !cart.customerPhone) continue

      processedCartIds.add(cart.id)

      const customerName = cart.customerName || 'Valued Customer'
      const cartItems = Array.isArray(cart.items) ? cart.items : []
      const formattedTotal = `${currencySymbol}${cart.totalValue.toFixed(2)}`
      const cartUrl = `${process.env.NEXT_PUBLIC_APP_URL}/cart/${cart.id}`

      let sendSuccess = false
      let error = ''

      try {
        switch (channel) {
          case 'email': {
            const emailHtml = EmailTemplates.abandoned(
              customerName,
              cartItems,
              cart.totalValue,
              cartUrl,
              store.name,
              currencySymbol
            )
            const emailResult = await sendEmail({
              to: cart.customerEmail!,
              subject: `Don't forget your items from ${store.name}!`,
              html: emailHtml,
              text: `Hi ${customerName}, you left items in your cart. Complete your order: ${cartUrl}`,
            })
            sendSuccess = emailResult.success
            if (!sendSuccess) error = emailResult.error || 'Unknown error'
            break
          }

          case 'sms': {
            const phoneNumber = sanitizePhoneNumber(cart.customerPhone!)
            const smsBody = `Hi ${customerName}, you left items in your ${store.name} cart! Complete your order: ${cartUrl}`
            const smsResult = await sendSMS({ to: phoneNumber, body: smsBody })
            sendSuccess = smsResult.success
            if (!sendSuccess) error = smsResult.error || 'Unknown error'
            break
          }

          case 'whatsapp': {
            const whatsappPhone = sanitizePhoneNumber(cart.customerPhone!)
            const whatsappMessage = `Hi ${customerName}, you left items in your ${store.name} cart worth ${formattedTotal}. Complete your purchase now: ${cartUrl}`
            const whatsappResult = await sendWhatsAppMessage({
              to: whatsappPhone,
              content: whatsappMessage,
            })
            sendSuccess = whatsappResult.success
            if (!sendSuccess) error = whatsappResult.error || 'Unknown error'
            break
          }

        }
      } catch (err: any) {
        console.error(`Error sending ${channel} for cart ${cart.id}:`, err)
        error = err.message
      }

      await prisma.message.create({
        data: {
          cartId: cart.id,
          campaignId: campaign.id,
          channel,
          content: `Cart recovery message (step ${step + 1}/${maxMessages}) for ${customerName}`,
          status: sendSuccess ? 'sent' : 'failed',
          sentAt: sendSuccess ? new Date() : null,
        },
      })

      if (sendSuccess) {
        messagesSent++
        const today = new Date(new Date().toDateString())
        const channelCounts = {
          smsCount: channel === 'sms' ? 1 : 0,
          whatsappCount: channel === 'whatsapp' ? 1 : 0,
          emailCount: channel === 'email' ? 1 : 0,
        }
        await prisma.analytics.upsert({
          where: { userId_date: { userId: campaign.userId, date: today } },
          update: { messagesSent: { increment: 1 }, ...channelCounts },
          create: { userId: campaign.userId, date: today, messagesSent: 1, ...channelCounts },
        })
      } else {
        messagesFailed++
        console.error(`Failed to send ${channel} message for cart ${cart.id}: ${error}`)
      }
    }
  }

  return {
    processedCarts: processedCartIds.size,
    messagesSent,
    messagesFailed,
  }
}
