import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { sendSMS, sanitizePhoneNumber } from '@/lib/services/sms'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
import { generateEmailContent, generateSMSContent, generateWhatsAppContent } from '@/lib/services/ai'
import type { CartContext } from '@/lib/services/ai'
import { releaseLock } from '@/lib/job-lock'
import { redisSetNX, redisIncr, redisGet, redisExpire, getRedis } from '@/lib/redis'
import { FREE_CARTS_THRESHOLD, PLANS } from '@/lib/payment'

const PAID_PLANS = Object.values(PLANS).filter(p => p.price > 0).map(p => p.id)
const MAX_STORE_CONCURRENCY = 10
const MAX_CARTS_PER_STORE = 300
const PER_STORE_LOCK_TTL = 4 * 60 * 1000

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥',
  AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ', CNY: '¥', KRW: '₩', BRL: 'R$',
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

async function acquirePerStoreLock(storeId: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true
  return redisSetNX(`lock:store:${storeId}`, '1', PER_STORE_LOCK_TTL)
}

async function releasePerStoreLock(storeId: string): Promise<void> {
  const redis = getRedis()
  if (redis) await releaseLock(`store:${storeId}`)
}

async function getCartsUsedForStore(userId: string, subscription: any): Promise<number> {
  const redis = getRedis()
  if (redis) {
    const key = `carts_used:${userId}:${subscription.id}`
    const cached = await redisGet(key)
    if (cached !== null) return parseInt(cached, 10)

    const count = await prisma.message.groupBy({
      by: ['cartId'],
      where: {
        campaign: { userId },
        sentAt: {
          gte: subscription.currentPeriodStart,
          lte: subscription.currentPeriodEnd,
        },
        status: 'sent',
      },
    })
    const total = count.length

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cartsUsedInPeriod: total },
    })

    const ttl = Math.max(60, Math.floor((subscription.currentPeriodEnd.getTime() - Date.now()) / 1000))
    await redisSetNX(key, String(total), Math.min(ttl, 300) * 1000)
    return total
  }

  const count = await prisma.message.groupBy({
    by: ['cartId'],
    where: {
      campaign: { userId },
      sentAt: {
        gte: subscription.currentPeriodStart,
        lte: subscription.currentPeriodEnd,
      },
      status: 'sent',
    },
  })
  return count.length
}

async function incrementCartsUsedCounter(userId: string, subscriptionId: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    const key = `carts_used:${userId}:${subscriptionId}`
    await redisIncr(key)
  }
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { cartsUsedInPeriod: { increment: 1 } },
  })
}

function makeAbTestVariant(cartId: string): 'A' | 'B' {
  return cartId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 2 === 0 ? 'A' : 'B'
}

async function processStore(campaign: any, limit: number): Promise<{ sent: number; failed: number }> {
  const { store } = campaign
  const lockAcquired = await acquirePerStoreLock(store.id)
  if (!lockAcquired) {
    console.log(`⏸️ Store ${store.id}: already being processed by another cycle — skipping`)
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  try {
    const storeOptOuts = await prisma.optOut.findMany({ where: { storeId: store.id } })
    const optedOutEmails = new Set(storeOptOuts.filter(o => o.email).map(o => o.email!.toLowerCase().trim()))
    const optedOutPhones = new Set(storeOptOuts.filter(o => o.phone).map(o => o.phone!.replace(/\D/g, '')))

    const subscription = await prisma.subscription.findFirst({
      where: { userId: campaign.userId },
    })

    const isPaidUser = subscription && PAID_PLANS.includes(subscription.plan) && subscription.status === 'active'

    if (isPaidUser) {
      const plan = Object.values(PLANS).find(p => p.id === subscription!.plan)
      const maxCarts = plan?.maxCarts ?? Infinity

      const cartsUsed = await getCartsUsedForStore(campaign.userId, subscription)
      if (cartsUsed >= maxCarts && maxCarts !== Infinity) {
        console.log(`⏸️ Store ${store.id}: plan limit ${maxCarts} reached. Skipping.`)
        return { sent: 0, failed: 0 }
      }
    } else {
      const recoveredCount = await prisma.recoveredCart.count({
        where: { storeId: store.id },
      })
      if (recoveredCount >= FREE_CARTS_THRESHOLD) {
        console.log(`⏸️ Store ${store.id}: ${recoveredCount} carts recovered (limit ${FREE_CARTS_THRESHOLD}). Free trial exhausted.`)
        return { sent: 0, failed: 0 }
      }
    }

    const planConfig = isPaidUser && subscription
      ? Object.values(PLANS).find(p => p.id === subscription.plan) || PLANS.FREE
      : PLANS.FREE
    const customerLimits = planConfig.maxMessagesPerCustomer

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

    while (cartsProcessedForStore < MAX_CARTS_PER_STORE) {
      const carts = await prisma.cart.findMany({
        where: {
          storeId: store.id,
          isRecovered: false,
          convertedAt: null,
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

      const customerMsgCounts = await getCustomerMessageCounts(store.id, carts)
      const cartResults = await Promise.allSettled(
        carts.map(cart => processSingleCart(cart, {
          campaign, store, subscription,
          sendDelayMs, followUpDelayMs, maxMessages, activeChannels, currencySymbol, abTest,
          optedOutEmails, optedOutPhones, customerLimits, customerMsgCounts,
        }))
      )

      for (const result of cartResults) {
        if (result.status === 'fulfilled') {
          sent += result.value.sent
          failed += result.value.failed
        } else {
          failed++
          console.error(`Cart processing error:`, result.reason)
        }
      }

      cartsProcessedForStore += carts.length
      cursor = carts[carts.length - 1].id
    }

    return { sent, failed }
  } finally {
    await releasePerStoreLock(store.id)
  }
}

type CustomerMsgCounts = Map<string, { email: number; sms: number; whatsapp: number }>

type CartConfig = {
  campaign: any
  store: any
  subscription: any
  sendDelayMs: number
  followUpDelayMs: number
  maxMessages: number
  activeChannels: string[]
  currencySymbol: string
  abTest: any
  optedOutEmails: Set<string>
  optedOutPhones: Set<string>
  customerLimits: { email: number; sms: number; whatsapp: number }
  customerMsgCounts: CustomerMsgCounts
}

async function getCustomerMessageCounts(storeId: string, carts: any[]): Promise<CustomerMsgCounts> {
  const customerKeys = new Set<string>()
  for (const cart of carts) {
    const key = (cart.customerEmail || cart.customerPhone || '').toLowerCase().trim()
    if (key) customerKeys.add(key)
  }
  if (customerKeys.size === 0) return new Map()

  const emails = new Set<string>()
  const phones = new Set<string>()
  for (const cart of carts) {
    if (cart.customerEmail) emails.add(cart.customerEmail.toLowerCase().trim())
    if (cart.customerPhone) phones.add(cart.customerPhone.replace(/\D/g, ''))
  }

  const messages = await prisma.message.findMany({
    where: {
      cart: {
        storeId,
        ...(emails.size > 0 && phones.size > 0
          ? { OR: [ { customerEmail: { in: Array.from(emails) } }, { customerPhone: { in: Array.from(phones) } } ] }
          : emails.size > 0
            ? { customerEmail: { in: Array.from(emails) } }
            : { customerPhone: { in: Array.from(phones) } }
        ),
      },
      status: 'sent',
    },
    select: {
      channel: true,
      cart: { select: { customerEmail: true, customerPhone: true } },
    },
  })

  const counts = new Map<string, { email: number; sms: number; whatsapp: number }>()
  for (const msg of messages) {
    const key = (msg.cart.customerEmail || msg.cart.customerPhone || '').toLowerCase().trim()
    if (!key) continue
    if (!counts.has(key)) counts.set(key, { email: 0, sms: 0, whatsapp: 0 })
    const entry = counts.get(key)!
    if (msg.channel === 'email') entry.email++
    else if (msg.channel === 'sms') entry.sms++
    else if (msg.channel === 'whatsapp') entry.whatsapp++
  }
  return counts
}

  async function processSingleCart(cart: any, config: CartConfig): Promise<{ sent: number; failed: number }> {
  const { campaign, store, subscription, sendDelayMs, followUpDelayMs, maxMessages, activeChannels, currencySymbol, abTest, optedOutEmails, optedOutPhones, customerLimits, customerMsgCounts } = config

  try {
    const step = cart.messages.length
    if (step >= maxMessages) return { sent: 0, failed: 0 }

    // Bargain-system integration hook: if this abandoned cart was linked to an
    // active bargain session, mark that session as `abandoned` so it shows up
    // in the Bargain → Recovery funnel. Fire-and-forget — must never block
    // the recovery pipeline.
    if (cart.cartId) {
      import('@/lib/bargain/hooks')
        .then(({ markBargainSessionAbandonedByCartToken }) =>
          markBargainSessionAbandonedByCartToken(cart.cartId)
        )
        .catch(() => {})
    }


    const requiredDelayMs = sendDelayMs + step * followUpDelayMs
    if (Date.now() - cart.abandonedAt.getTime() < requiredDelayMs) return { sent: 0, failed: 0 }

    const scheduledChannel = activeChannels[step % activeChannels.length]
    const channelOrder = [
      scheduledChannel,
      ...activeChannels.filter(c => c !== scheduledChannel),
    ]

    const availableChannels = channelOrder.filter(c => {
      if (cart.messages.some((m: any) => m.channel === c)) return false
      if (c === 'email') return Boolean(cart.customerEmail)
      if (c === 'sms' || c === 'whatsapp') return Boolean(cart.customerPhone)
      return false
    })

    if (availableChannels.length === 0) return { sent: 0, failed: 0 }

    const customerEmail = cart.customerEmail?.toLowerCase().trim()
    const customerPhone = cart.customerPhone?.replace(/\D/g, '')

    if (customerEmail && optedOutEmails.has(customerEmail)) return { sent: 0, failed: 0 }
    if (customerPhone && !customerEmail && optedOutPhones.has(customerPhone)) return { sent: 0, failed: 0 }

    const customerKey = (customerEmail || customerPhone || '').toLowerCase().trim()
    const customerCounts = customerKey ? customerMsgCounts.get(customerKey) : undefined

    const channelLimited = (ch: string): boolean => {
      if (!customerCounts || !customerKey) return false
      const limit = customerLimits[ch as keyof typeof customerLimits] ?? Infinity
      if (limit === Infinity) return false
      const used = customerCounts[ch as keyof typeof customerCounts] ?? 0
      return used >= limit
    }

    const limitedChannels = availableChannels.filter(ch => channelLimited(ch))
    const allowedChannels = availableChannels.filter(ch => !channelLimited(ch))

    if (limitedChannels.length > 0) {
      console.log(`📵 Customer ${customerKey}: reached limit for ${limitedChannels.join(', ')} (plan limit: ${JSON.stringify(customerLimits)})`)
    }

    const overageEligible = subscription?.overageEnabled
    const channelsToProcess = overageEligible ? availableChannels : allowedChannels
    const isOverageChannel = (ch: string): boolean => channelLimited(ch)

    if (channelsToProcess.length === 0) return { sent: 0, failed: 0 }

    let abTestVariant: string | null = null
    let adjActiveChannels = [...activeChannels]
    let adjSendDelayMs = sendDelayMs
    let adjFollowUpDelayMs = followUpDelayMs
    let adjMaxMessages = maxMessages

    if (abTest) {
      abTestVariant = makeAbTestVariant(cart.id)
      const variant = abTestVariant === 'A' ? abTest.variantA : abTest.variantB
      if (variant && typeof variant === 'object') {
        const cfg = variant as Record<string, any>
        if (Array.isArray(cfg.channels)) adjActiveChannels = cfg.channels
        if (typeof cfg.sendDelay === 'number') adjSendDelayMs = cfg.sendDelay * 60 * 1000
        if (typeof cfg.followUpDelay === 'number') adjFollowUpDelayMs = cfg.followUpDelay * 60 * 1000
        if (typeof cfg.maxFollowUps === 'number') adjMaxMessages = Math.min(adjActiveChannels.length, cfg.maxFollowUps + 1)
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

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

    const cartCtx: CartContext = {
      customerName,
      items: cartItems,
      storeName: store.name,
      total: cart.totalValue,
      currencySymbol,
      cartUrl: '',
      discountCode: campaign.discountEnabled ? campaign.discountCode || undefined : undefined,
      discountValue: campaign.discountEnabled ? campaign.discountValue || undefined : undefined,
      discountType: campaign.discountEnabled ? campaign.discountType || undefined : undefined,
    }

    let globalSendSuccess = false
    for (const ch of channelsToProcess) {
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
              const ai = await generateEmailContent(cartCtx, store.id)
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
              const ai = await generateSMSContent(cartCtx, store.id)
              smsBody = ai ? `${ai.body}\n\n${cartUrl}` : fallbackSMSText(customerName, store.name, formatProductList(cartItems), formattedTotal, cartUrl, campaign.discountCode ?? undefined, campaign.discountValue ?? undefined, campaign.discountType ?? undefined)
            } else {
              smsBody = fallbackSMSText(customerName, store.name, formatProductList(cartItems), formattedTotal, cartUrl, campaign.discountCode ?? undefined, campaign.discountValue ?? undefined, campaign.discountType ?? undefined)
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
                const ai = await generateWhatsAppContent(cartCtx, store.id)
                whatsappMessage = ai ? `${ai.body}\n\n${cartUrl}` : fallbackWhatsAppText(customerName, store.name, itemsBlock || '(cart is empty)', formattedTotal, cartUrl, campaign.discountCode ?? undefined, campaign.discountValue ?? undefined, campaign.discountType ?? undefined)
              } else {
                whatsappMessage = fallbackWhatsAppText(customerName, store.name, itemsBlock || '(cart is empty)', formattedTotal, cartUrl, campaign.discountCode ?? undefined, campaign.discountValue ?? undefined, campaign.discountType ?? undefined)
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
      let messageSaved = false
      try {
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
        messageSaved = true
      } catch (msgErr) {
        console.error(`Failed to save message record for cart ${cart.id} (${ch}):`, msgErr)
      }

      if (sendSuccess && messageSaved) {
        globalSendSuccess = true
        if (subscription) {
          await incrementCartsUsedCounter(campaign.userId, subscription.id)
          if (isOverageChannel(ch)) {
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: { overageMessages: { increment: 1 } },
            })
            subscription.overageMessages++
          }
        }
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
        console.error(`Failed to send ${ch} message for cart ${cart.id}: ${error || 'message record not saved'}`)
      }
    }

    return { sent: globalSendSuccess ? 1 : 0, failed: globalSendSuccess ? 0 : 1 }
  } catch (err: any) {
    console.error(`Unexpected error processing cart ${cart.id}:`, err?.message || err)
    return { sent: 0, failed: 1 }
  }
}

export async function processAbandonedCarts(
  limit = 25,
  storeCursor?: string
): Promise<ProcessResult & { nextCursor?: string; storesProcessed: number }> {
  let messagesSent = 0
  let messagesFailed = 0
  let processedCount = 0
  let storesProcessed = 0
  let nextCursor: string | undefined

  try {
    const startTime = Date.now()

    const campaigns = await prisma.campaign.findMany({
      where: { isActive: true },
      include: { store: true },
      orderBy: { storeId: 'asc' },
    })

    let targetCampaigns = campaigns
    if (storeCursor) {
      const cursorIdx = campaigns.findIndex(c => c.store.id === storeCursor)
      if (cursorIdx >= 0) {
        targetCampaigns = campaigns.slice(cursorIdx + 1)
      }
    }

    // Process only 1 store per cycle to stay within timeout
    const batch = targetCampaigns.slice(0, 1)
    const results: PromiseSettledResult<{ sent: number; failed: number }>[] = []

    for (const campaign of batch) {
      const r = await Promise.allSettled([processStore(campaign, limit)])
      results.push(...r)
      if (r[0]?.status === 'fulfilled') storesProcessed++
      nextCursor = campaign.store.id
    }

    for (const result of results) {
      if (result.status === 'fulfilled') {
        messagesSent += result.value.sent
        messagesFailed += result.value.failed
      } else {
        messagesFailed++
        console.error('Store processing error:', result.reason)
      }
    }

    processedCount = messagesSent

    const elapsed = Date.now() - startTime
    if (storesProcessed > 0) {
      console.log(`✅ Processed ${processedCount} carts from 1 store (${messagesSent} sent, ${messagesFailed} failed) in ${elapsed}ms. Next cursor: ${nextCursor}`)
    } else {
      console.log(`⏸️ No stores to process — ${campaigns.length} campaigns exist, cursor: ${storeCursor || 'start'}`)
      nextCursor = undefined
    }

    return { processedCarts: processedCount, messagesSent, messagesFailed, nextCursor, storesProcessed }
  } catch (err) {
    console.error('Fatal error in processAbandonedCarts:', err)
    return { processedCarts: processedCount, messagesSent, messagesFailed, nextCursor, storesProcessed }
  }
}

function fallbackSMSText(customerName: string, storeName: string, productList: string, formattedTotal: string, cartUrl: string, discountCode?: string, discountValue?: number, discountType?: string): string {
  const discountLine = discountCode
    ? `Use code ${discountCode}${discountValue ? ` for ${discountValue}${discountType === 'percentage' ? '%' : ''} off` : ''}!`
    : ''
  return [
    `✨ ${customerName}, you've got great taste!`,
    `Your picks from ${storeName} are absolutely beautiful — each one chosen with care. We've saved them all for you. 💫`,
    ``,
    `${productList} — ${formattedTotal}`,
    discountLine ? `` : null,
    discountLine ? discountLine : null,
    ``,
    `Complete checkout: ${cartUrl}`,
    `Reply STOP to unsubscribe`,
  ].filter(Boolean).join('\n')
}

function fallbackWhatsAppText(customerName: string, storeName: string, itemsBlock: string, formattedTotal: string, cartUrl: string, discountCode?: string, discountValue?: number, discountType?: string): string {
  const discountLine = discountCode
    ? `Use code *${discountCode}*${discountValue ? ` for ${discountValue}${discountType === 'percentage' ? '%' : ''} off` : ''}! 🎉`
    : ''
  const lines = [
    `Hey ${customerName}! ✨`,
    ``,
    `You've got incredible taste! The pieces you picked from ${storeName} are absolutely beautiful — each one thoughtfully chosen. We've saved your cart so you don't miss out. 💫`,
    ``,
    itemsBlock,
    ``,
    `*Total: ${formattedTotal}*`,
    discountLine ? `` : null,
    discountLine ? discountLine : null,
    ``,
    `⏳ The best finds always go fast. Complete your purchase:`,
    `${cartUrl}`,
    `Reply STOP to unsubscribe from all messages`,
  ]
  return lines.filter(Boolean).join('\n')
}
