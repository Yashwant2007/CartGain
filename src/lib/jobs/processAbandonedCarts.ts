import prisma from '@/lib/db'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { sendSMS, sanitizePhoneNumber } from '@/lib/services/sms'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { generateEmailContent, generateSMSContent, generateWhatsAppContent } from '@/lib/services/ai'
import type { CartContext } from '@/lib/services/ai'
import { acquireLock, releaseLock } from '@/lib/job-lock'
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

function formatProductList(items: any[], maxItems = 2): string {
  const names = items.slice(0, maxItems).map((i: any) => i.name)
  const rest = items.length - maxItems
  let result = names.join(', ')
  if (rest > 0) result += ` & ${rest} more`
  return result
}

function getFirstProductImage(items: any[]): string | undefined {
  const first = items.find((i: any) => i.image)
  return first?.image || undefined
}

export async function processAbandonedCarts(limit = 25): Promise<ProcessResult> {
  const lockKey = 'process-abandoned-carts'
  if (!(await acquireLock(lockKey))) {
    console.log('⏸️ Job already running — skipping concurrent execution')
    return { processedCarts: 0, messagesSent: 0, messagesFailed: 0 }
  }

  let messagesSent = 0
  let messagesFailed = 0
  const processedCartIds = new Set<string>()

  try {
    const startTime = Date.now()

    const campaigns = await prisma.campaign.findMany({
      where: { isActive: true },
      include: { store: true },
      take: 100,
    })

    for (const campaign of campaigns) {
      const { store } = campaign

      const subscription = await prisma.subscription.findFirst({
        where: { userId: campaign.userId },
      })

      const isPaidUser = subscription && PAID_PLANS.includes(subscription.plan) && subscription.status === 'active'

      if (isPaidUser) {
        const plan = Object.values(PLANS).find(p => p.id === subscription!.plan)
        const maxCarts = plan?.maxCarts ?? Infinity

        const cartsUsedInPeriod = await prisma.message.groupBy({
          by: ['cartId'],
          where: {
            campaign: { userId: campaign.userId },
            sentAt: {
              gte: subscription!.currentPeriodStart,
              lte: subscription!.currentPeriodEnd,
            },
            status: 'sent',
          },
        })

        if (cartsUsedInPeriod.length >= maxCarts && maxCarts !== Infinity) {
          console.log(`⏸️ Store ${store.id}: plan limit ${maxCarts} carts reached. Skipping.`)
          continue
        }
      } else {
        const recoveredCount = await prisma.recoveredCart.count({
          where: { storeId: store.id },
        })

        if (recoveredCount >= FREE_CARTS_THRESHOLD) {
          console.log(`⏸️ Store ${store.id}: ${recoveredCount} carts recovered (limit ${FREE_CARTS_THRESHOLD}). Free trial exhausted, skipping.`)
          continue
        }
      }

      const channels = campaign.channels.length > 0 ? campaign.channels : ['whatsapp', 'sms', 'email']
      let sendDelayMs = campaign.sendDelay * 60 * 1000
      let followUpDelayMs = campaign.followUpDelay * 60 * 1000
      let maxMessages = Math.min(channels.length, campaign.maxFollowUps + 1)
      let activeChannels = [...channels]
      const currencySymbol = getCurrencySymbol(store.currency)

      const abTest = await prisma.aBTest.findFirst({
        where: { campaignId: campaign.id, isCompleted: false },
        orderBy: { createdAt: 'desc' },
      })

      let cursor: string | undefined
      let cartsProcessedForStore = 0

      while (cartsProcessedForStore < 200) {
        const carts = await prisma.cart.findMany({
          where: {
            storeId: store.id,
            isRecovered: false,
            abandonedAt: { lte: new Date(Date.now() - sendDelayMs) },
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
          },
          take: limit,
          orderBy: { abandonedAt: 'asc' },
        })

        if (carts.length === 0) break

        for (const cart of carts) {
          try {
            if (processedCartIds.has(cart.id)) continue

            const step = cart.messages.length
            if (step >= maxMessages) continue

            const requiredDelayMs = sendDelayMs + step * followUpDelayMs
            if (Date.now() - cart.abandonedAt.getTime() < requiredDelayMs) continue

            const channel = activeChannels[step % activeChannels.length]

            const alreadySentOnChannel = cart.messages.some(m => m.channel === channel)
            if (alreadySentOnChannel) continue

            if (channel === 'email' && !cart.customerEmail) continue
            if ((channel === 'sms' || channel === 'whatsapp') && !cart.customerPhone) continue

            const customerEmail = cart.customerEmail?.toLowerCase().trim()
            const customerPhone = cart.customerPhone?.replace(/\D/g, '')

            if (customerEmail) {
              const optedOut = await prisma.optOut.findUnique({
                where: { storeId_email: { storeId: store.id, email: customerEmail } },
              })
              if (optedOut) {
                console.log(`⏭️ Skipping cart ${cart.id}: customer ${customerEmail} has opted out`)
                continue
              }
            }

            if (customerPhone && !customerEmail) {
              const optedOut = await prisma.optOut.findUnique({
                where: { storeId_phone: { storeId: store.id, phone: customerPhone } },
              })
              if (optedOut) {
                console.log(`⏭️ Skipping cart ${cart.id}: customer ${customerPhone} has opted out`)
                continue
              }
            }

            processedCartIds.add(cart.id)
            cartsProcessedForStore++

            let abTestVariant: string | null = null
            if (abTest) {
              const hash = cart.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
              abTestVariant = hash % 2 === 0 ? 'A' : 'B'
              const variant = abTestVariant === 'A' ? abTest.variantA : abTest.variantB
              if (variant && typeof variant === 'object') {
                const cfg = variant as Record<string, any>
                if (Array.isArray(cfg.channels)) activeChannels = cfg.channels
                if (typeof cfg.sendDelay === 'number') sendDelayMs = cfg.sendDelay * 60 * 1000
                if (typeof cfg.followUpDelay === 'number') followUpDelayMs = cfg.followUpDelay * 60 * 1000
                if (typeof cfg.maxFollowUps === 'number') maxMessages = Math.min(activeChannels.length, cfg.maxFollowUps + 1)
              }
            }

            const customerName = cart.customerName || 'Valued Customer'
            const rawItems = Array.isArray(cart.items) ? cart.items : []
            const cartItems = rawItems as { name: string; description?: string; price: number; quantity: number; image?: string }[]
            const formattedTotal = `${currencySymbol}${cart.totalValue.toFixed(2)}`
            const cartUrl = `${process.env.NEXT_PUBLIC_APP_URL}/cart/${cart.id}`

            let sendSuccess = false
            let error = ''

            const cartCtx: CartContext = {
              customerName,
              items: cartItems,
              storeName: store.name,
              total: cart.totalValue,
              currencySymbol,
              cartUrl,
            }

            try {
              switch (channel) {
                case 'email': {
                  let aiSubject: string | undefined
                  let aiBody: string | undefined
                  if (campaign.aiOptimized) {
                    const ai = await generateEmailContent(cartCtx)
                    if (ai) {
                      aiSubject = ai.subject
                      aiBody = ai.body
                    }
                  }
                  const emailHtml = EmailTemplates.abandoned(customerName, cartItems, cart.totalValue, cartUrl, store.name, currencySymbol, aiBody)
                  const emailResult = await sendEmail({
                    to: cart.customerEmail!,
                    subject: aiSubject || `🛍️ ${customerName}, your ${store.name} cart is waiting!`,
                    html: emailHtml,
                    text: aiBody
                      ? `🛍️ ${customerName}, complete your order: ${cartUrl}`
                      : `🛍️ ${customerName}, your cart from ${store.name} is still warm! ${formatProductList(cartItems)} — Total: ${formattedTotal}. Complete your order: ${cartUrl}`,
                  })
                  sendSuccess = emailResult.success
                  if (!sendSuccess) error = emailResult.error || 'Unknown error'
                  break
                }

                case 'sms': {
                  let smsBody: string
                  if (campaign.aiOptimized) {
                    const ai = await generateSMSContent(cartCtx)
                    smsBody = ai ? `${ai.body}\n\n${cartUrl}` : fallbackSMSText(customerName, store.name, formatProductList(cartItems), formattedTotal, cartUrl)
                  } else {
                    smsBody = fallbackSMSText(customerName, store.name, formatProductList(cartItems), formattedTotal, cartUrl)
                  }
                  const phoneNumber = sanitizePhoneNumber(cart.customerPhone!)
                  const smsResult = await sendSMS({ to: phoneNumber, body: smsBody })
                  sendSuccess = smsResult.success
                  if (!sendSuccess) error = smsResult.error || 'Unknown error'
                  break
                }

                case 'whatsapp': {
                  const itemLines = cartItems.slice(0, 4).map((i: any) =>
                    `• ${i.name} × ${i.quantity || 1} — ${currencySymbol}${Number(i.price).toFixed(2)}`
                  ).join('\n')
                  const restCount = cartItems.length - 4
                  const itemsBlock = restCount > 0 ? `${itemLines}\n• …and ${restCount} more item${restCount > 1 ? 's' : ''}` : itemLines

                  let whatsappMessage: string
                  if (campaign.aiOptimized) {
                    const ai = await generateWhatsAppContent(cartCtx)
                    whatsappMessage = ai ? `${ai.body}\n\n${cartUrl}` : fallbackWhatsAppText(customerName, store.name, itemsBlock || '(cart is empty)', formattedTotal, cartUrl)
                  } else {
                    whatsappMessage = fallbackWhatsAppText(customerName, store.name, itemsBlock || '(cart is empty)', formattedTotal, cartUrl)
                  }
                  const firstImage = getFirstProductImage(cartItems)
                  const whatsappResult = await sendWhatsAppMessage({ to: sanitizePhoneNumber(cart.customerPhone!), content: whatsappMessage, mediaUrl: firstImage })
                  sendSuccess = whatsappResult.success
                  if (!sendSuccess) error = whatsappResult.error || 'Unknown error'
                  break
                }
              }
            } catch (err: any) {
              console.error(`Error sending ${channel} for cart ${cart.id}:`, err)
              error = err.message
            }

            const abTag = abTestVariant ? ` [AB:${abTestVariant}]` : ''
            await prisma.message.create({
              data: {
                cartId: cart.id,
                campaignId: campaign.id,
                channel,
                content: `Cart recovery message (step ${step + 1}/${maxMessages}) for ${customerName}${abTag}`,
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
          } catch (err: any) {
            messagesFailed++
            console.error(`Unexpected error processing cart ${cart.id}:`, err)
          }
        }

        cursor = carts[carts.length - 1].id
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`✅ Processed ${processedCartIds.size} carts (${messagesSent} sent, ${messagesFailed} failed) in ${elapsed}ms`)

    return {
      processedCarts: processedCartIds.size,
      messagesSent,
      messagesFailed,
    }
  } catch (err) {
    console.error('Fatal error in processAbandonedCarts:', err)
    return { processedCarts: processedCartIds.size, messagesSent, messagesFailed }
  } finally {
    await releaseLock(lockKey)
  }
}

function fallbackSMSText(customerName: string, storeName: string, productList: string, formattedTotal: string, cartUrl: string): string {
  return [
    `✨ ${customerName}, you've got great taste!`,
    `Your picks from ${storeName} are absolutely beautiful — each one chosen with care. We've saved them all for you. 💫`,
    ``,
    `${productList} — ${formattedTotal}`,
    ``,
    `Complete checkout: ${cartUrl}`,
    `Reply STOP to unsubscribe`,
  ].join('\n')
}

function fallbackWhatsAppText(customerName: string, storeName: string, itemsBlock: string, formattedTotal: string, cartUrl: string): string {
  return [
    `Hey ${customerName}! ✨`,
    ``,
    `You've got incredible taste! The pieces you picked from ${storeName} are absolutely beautiful — each one thoughtfully chosen. We've saved your cart so you don't miss out. 💫`,
    ``,
    itemsBlock,
    ``,
    `*Total: ${formattedTotal}*`,
    ``,
    `⏳ The best finds always go fast. Complete your purchase:`,
    `${cartUrl}`,
    `Reply STOP to unsubscribe from all messages`,
  ].join('\n')
}
