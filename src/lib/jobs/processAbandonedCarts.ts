import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { sendSMS, sanitizePhoneNumber } from '@/lib/services/sms'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
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
            convertedAt: null, // skip carts that already became orders — never message a customer who already bought
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

            // Compute eligible channels in priority order (try scheduled channel
            // first, then remaining). Each cart tries channels in sequence until
            // one succeeds — if WhatsApp fails (no approved template), we fall
            // through to email or SMS instead of giving up.
            const scheduledChannel = activeChannels[step % activeChannels.length]
            const channelOrder = [
              scheduledChannel,
              ...activeChannels.filter(c => c !== scheduledChannel),
            ]

            const availableChannels = channelOrder.filter(c => {
              if (cart.messages.some(m => m.channel === c)) return false
              if (c === 'email') return Boolean(cart.customerEmail)
              if (c === 'sms' || c === 'whatsapp') return Boolean(cart.customerPhone)
              return false
            })

            if (availableChannels.length === 0) continue

            const customerEmail = cart.customerEmail?.toLowerCase().trim()
            const customerPhone = cart.customerPhone?.replace(/\D/g, '')

            if (customerEmail) {
              const optedOut = await prisma.optOut.findUnique({
                where: { storeId_email: { storeId: store.id, email: customerEmail } },
              })
              if (optedOut) {
                console.log(`⏭️ Skipping cart ${cart.id}: customer email opted out`)
                continue
              }
            }

            if (customerPhone && !customerEmail) {
              const optedOut = await prisma.optOut.findUnique({
                where: { storeId_phone: { storeId: store.id, phone: customerPhone } },
              })
              if (optedOut) {
                console.log(`⏭️ Skipping cart ${cart.id}: customer phone opted out`)
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

            await logDataAccess({
              actorType: 'system',
              action: 'read',
              resourceType: 'cart',
              resourceId: cart.id,
              purpose: 'abandoned cart recovery message processing',
              actorId: campaign.userId,
              metadata: {
                storeId: store.id,
                channels: availableChannels,
                cartHasEmail: Boolean(cart.customerEmail),
                cartHasPhone: Boolean(cart.customerPhone),
              },
            })

            // Click-tracking redirect: stamps clickedAt for this channel, then forwards
            // to the cart page. Powers provable per-channel attribution.
            const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

            const cartCtx: CartContext = {
              customerName,
              items: cartItems,
              storeName: store.name,
              total: cart.totalValue,
              currencySymbol,
              cartUrl: '', // set per-channel below
            }

            // Try each available channel in priority order; break on first success
            let globalSendSuccess = false
            for (const ch of availableChannels) {
              const cartUrl = `${appUrl}/r/${cart.id}?c=${ch}`
              cartCtx.cartUrl = cartUrl

              let sendSuccess = false
              let error = ''

              try {
                switch (ch) {
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
                    const firstImage = getFirstProductImage(cartItems)
                    const topProduct = cartItems[0]?.name || 'your items'

                    // Use template for initial outreach, free-form text for follow-ups (24h window may open by then)
                    if (step === 0) {
                      const template = WhatsAppTemplates.abandoned_cart
                      const params = template.generateParams(customerName, topProduct, firstImage, cartUrl)
                      const whatsappResult = await sendWhatsAppMessage({
                        to: sanitizePhoneNumber(cart.customerPhone!),
                        templateName: template.name,
                        templateParams: params,
                      })
                      sendSuccess = whatsappResult.success
                      if (!sendSuccess) error = whatsappResult.error || 'Unknown error'
                    } else {
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
                      const whatsappResult = await sendWhatsAppMessage({
                        to: sanitizePhoneNumber(cart.customerPhone!),
                        content: whatsappMessage,
                        mediaUrl: firstImage,
                      })
                      sendSuccess = whatsappResult.success
                      if (!sendSuccess) error = whatsappResult.error || 'Unknown error'
                    }
                    break
                  }
                }
              } catch (err: any) {
                console.error(`Error sending ${ch} for cart ${cart.id}:`, err?.message || err)
                error = err.message
              }

              const abTag = abTestVariant ? ` [AB:${abTestVariant}]` : ''
              await prisma.message.create({
                data: {
                  cartId: cart.id,
                  campaignId: campaign.id,
                  channel: ch,
                  content: `Cart recovery message (step ${step + 1}/${maxMessages}) for ${customerName}${abTag}`,
                  status: sendSuccess ? 'sent' : 'failed',
                  sentAt: sendSuccess ? new Date() : null,
                },
              })

              if (sendSuccess) {
                globalSendSuccess = true
                messagesSent++
                const today = new Date(new Date().toDateString())
                const channelCounts = {
                  smsCount: ch === 'sms' ? 1 : 0,
                  whatsappCount: ch === 'whatsapp' ? 1 : 0,
                  emailCount: ch === 'email' ? 1 : 0,
                }
                await prisma.analytics.upsert({
                  where: { userId_date: { userId: campaign.userId, date: today } },
                  update: { messagesSent: { increment: 1 }, ...channelCounts },
                  create: { userId: campaign.userId, date: today, messagesSent: 1, ...channelCounts },
                })
                break
              } else {
                console.error(`Failed to send ${ch} message for cart ${cart.id}: ${error}`)
              }
            }

            if (!globalSendSuccess) {
              messagesFailed++
            }
          } catch (err: any) {
            messagesFailed++
            console.error(`Unexpected error processing cart ${cart.id}:`, err?.message || err)
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
