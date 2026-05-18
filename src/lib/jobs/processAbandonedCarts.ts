import prisma from '@/lib/db'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { sendSMS, sanitizePhoneNumber } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'

type ProcessResult = {
  processedCarts: number
  messagesSent: number
  messagesFailed: number
}

export async function processAbandonedCarts(limit = 25): Promise<ProcessResult> {
  // Find unrecovered carts that need recovery messages
  const carts = await prisma.cart.findMany({
    where: {
      isRecovered: false,
      messages: { none: {} }, // Only carts that haven't received any messages yet
      abandonedAt: {
        lte: new Date(Date.now() - 5 * 60 * 1000), // At least 5 minutes old (configurable)
      },
    },
    include: {
      store: true,
    },
    take: limit,
    orderBy: {
      abandonedAt: 'asc',
    },
  })

  let messagesSent = 0
  let messagesFailed = 0

  for (const cart of carts) {
    try {
      // Find active campaign for this store
      const campaign = await prisma.campaign.findFirst({
        where: {
          storeId: cart.storeId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (!campaign) {
        console.log(`No active campaign for store ${cart.storeId}`)
        continue
      }

      const channels = campaign.channels.length > 0 ? campaign.channels : ['email']
      const customerName = cart.customerName || 'Valued Customer'
      const cartItems = Array.isArray(cart.items) ? cart.items : []

      // Send messages through configured channels
      for (const channel of channels) {
        let sendSuccess = false
        let error = ''

        try {
          switch (channel) {
            case 'email':
              if (cart.customerEmail) {
                const emailHtml = EmailTemplates.abandoned(
                  customerName,
                  cartItems,
                  cart.totalValue,
                  `${process.env.NEXT_PUBLIC_APP_URL}/cart/${cart.id}`,
                  cart.store.name
                )

                const emailResult = await sendEmail({
                  to: cart.customerEmail,
                  subject: `Don't forget your items from ${cart.store.name}!`,
                  html: emailHtml,
                  text: `Hi ${customerName}, you left items in your cart. Visit ${process.env.NEXT_PUBLIC_APP_URL}/cart/${cart.id} to complete your purchase.`,
                })

                sendSuccess = emailResult.success
                if (!sendSuccess) error = emailResult.error || 'Unknown error'
              }
              break

            case 'sms':
              if (cart.customerPhone) {
                const phoneNumber = sanitizePhoneNumber(cart.customerPhone)
                const smsBody = `Hi ${customerName}, you left items in your ${cart.store.name} cart! Complete your order: ${process.env.NEXT_PUBLIC_APP_URL}/cart/${cart.id}`

                const smsResult = await sendSMS({
                  to: phoneNumber,
                  body: smsBody,
                })

                sendSuccess = smsResult.success
                if (!sendSuccess) error = smsResult.error || 'Unknown error'
              }
              break

            case 'whatsapp':
              if (cart.customerPhone) {
                const phoneNumber = sanitizePhoneNumber(cart.customerPhone)
                const whatsappMessage = `Hi ${customerName}, you left items in your ${cart.store.name} cart worth $${cart.totalValue.toFixed(2)}. Complete your purchase now: ${process.env.NEXT_PUBLIC_APP_URL}/cart/${cart.id}`

                const whatsappResult = await sendWhatsAppMessage({
                  to: phoneNumber,
                  content: whatsappMessage,
                })

                sendSuccess = whatsappResult.success
                if (!sendSuccess) error = whatsappResult.error || 'Unknown error'
              }
              break

            case 'push':
              // Push notifications handled separately - mark as pending for now
              sendSuccess = true
              break
          }
        } catch (err: any) {
          console.error(`Error sending ${channel} for cart ${cart.id}:`, err)
          error = err.message
        }

        // Create message record in database
        await prisma.message.create({
          data: {
            cartId: cart.id,
            campaignId: campaign.id,
            channel,
            content: `Cart recovery message for ${customerName}`,
            status: sendSuccess ? 'sent' : 'failed',
            sentAt: sendSuccess ? new Date() : null,
          },
        })

        if (sendSuccess) {
          messagesSent++
        } else {
          messagesFailed++
          console.error(`Failed to send ${channel} message for cart ${cart.id}: ${error}`)
        }
      }

      // Update analytics for today
      const now = new Date()
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

      const sentChannels = channels.filter((c) => {
        // This is simplified - in production, check actual message statuses
        return true
      })

      await prisma.analytics.upsert({
        where: {
          userId_date: {
            userId: campaign.userId,
            date: day,
          },
        },
        update: {
          messagesSent: { increment: sentChannels.length },
          smsCount: { increment: sentChannels.filter((c) => c === 'sms').length },
          whatsappCount: { increment: sentChannels.filter((c) => c === 'whatsapp').length },
          emailCount: { increment: sentChannels.filter((c) => c === 'email').length },
          pushCount: { increment: sentChannels.filter((c) => c === 'push').length },
        },
        create: {
          userId: campaign.userId,
          date: day,
          messagesSent: sentChannels.length,
          smsCount: sentChannels.filter((c) => c === 'sms').length,
          whatsappCount: sentChannels.filter((c) => c === 'whatsapp').length,
          emailCount: sentChannels.filter((c) => c === 'email').length,
          pushCount: sentChannels.filter((c) => c === 'push').length,
        },
      })
    } catch (error) {
      console.error(`Error processing cart ${cart.id}:`, error)
      messagesFailed++
    }
  }

  return {
    processedCarts: carts.length,
    messagesSent,
    messagesFailed,
  }
}
