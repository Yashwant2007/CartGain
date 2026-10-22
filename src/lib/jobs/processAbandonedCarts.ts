import prisma from '@/lib/db'
import { logDataAccess, redactSensitive } from '@/lib/data-protection'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { buildOptOutUrl } from '@/lib/opt-out'
import { sanitizePhoneNumber } from '@/lib/utils'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
import { resolveRecoveryOffer } from '@/lib/recovery/offer'
import { enrichCartItemsWithImages } from '@/lib/recovery/product-image'
import { buildRecoveryLink } from '@/lib/recovery/links'
import { composeRecoveryMessage, singleLineMessage, stripLeadingGreeting } from '@/lib/conversation/recovery'
import type { ConversationDiscount } from '@/lib/conversation/facts'
import { isWithinQuietHours } from '@/lib/conversation/variety'
import { resolveVoice } from '@/lib/conversation/voice'
import type { BrandVoice } from '@/lib/conversation/voice'
import { loadStoreVoiceSettings } from '@/lib/conversation/store'
import { releaseLock } from '@/lib/job-lock'
import { redisSetNX, redisIncr, redisGet, redisExpire, getRedis } from '@/lib/redis'
import { FREE_CARTS_THRESHOLD, PLANS, PAID_PLAN_IDS, resolvePlanId, getPlan } from '@/lib/payment'
import { track } from '@/lib/analytics/track'

const PAID_PLANS = PAID_PLAN_IDS
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

    const isPaidUser = !!(subscription && (PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(subscription.plan)) && subscription.status === 'active')

    // Cart overage: a paid merchant is never hard-stopped at their cart quota —
    // carts recovered beyond it are recorded and billed (plan.bargainOverageCartPrice)
    // on the next invoice. This is what makes "up to N recovered carts" a metered
    // allowance rather than a silent hard cap. Free plans still hard-stop.
    let cartOverageActive = false
    if (isPaidUser) {
      const plan = getPlan(subscription!.plan)
      const maxCarts = plan?.maxCarts ?? Infinity
      const cartsUsed = await getCartsUsedForStore(campaign.userId, subscription)
      if (maxCarts !== Infinity && cartsUsed >= maxCarts) {
        cartOverageActive = true
      }
    } else {
      const processedCarts = await prisma.message.groupBy({
        by: ['cartId'],
        where: {
          campaign: { userId: campaign.userId },
          status: 'sent',
        },
      })
      const cartsUsed = processedCarts.length
      if (cartsUsed >= FREE_CARTS_THRESHOLD) {
        console.log(`⏸️ Store ${store.id}: ${cartsUsed} carts processed (limit ${FREE_CARTS_THRESHOLD}). Free trial exhausted.`)
        return { sent: 0, failed: 0 }
      }
    }

    const planConfig = isPaidUser && subscription
      ? getPlan(subscription.plan)
      : PLANS.FREE
    const customerLimits = planConfig.maxMessagesPerCustomer

    const channels = (campaign.channels.length > 0 ? campaign.channels : ['whatsapp', 'email']).filter((c: string) => c !== 'sms')
    let sendDelayMs = campaign.sendDelay * 60 * 1000
    let followUpDelayMs = campaign.followUpDelay * 60 * 1000
    let maxMessages = Math.min(channels.length, campaign.maxFollowUps + 1)
    let activeChannels = [...channels]
    const currencySymbol = getCurrencySymbol(store.currency)
    // Brand voice + quiet hours are loaded once per store per cycle. A DB
    // failure degrades to the default voice rather than blocking recovery.
    const voiceSettings = await loadStoreVoiceSettings(store.id).catch(() => null)
    const voice = voiceSettings ?? resolveVoice(null)
    const quietHoursStart = voiceSettings?.quietHoursStart ?? null
    const quietHoursEnd = voiceSettings?.quietHoursEnd ?? null

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

      // ── Same-batch customer dedupe ──────────────────────────────────────
      // The cart-token / checkout-token dual-family rows can represent the SAME
      // abandonment as two Cart rows for one customer. At most ONE message per
      // customer per batch, otherwise a recovery cycle can spam the same buyer
      // twice. Trade-off (documented in docs): two genuinely different carts of
      // the same customer in one batch get queued to the next cycle.
      const seenCustomers = new Set<string>()
      const candidates = carts.filter((cart: any) => {
        const key = (cart.customerEmail || cart.customerPhone || '').toLowerCase().trim()
        if (!key) return true
        if (seenCustomers.has(key)) return false
        seenCustomers.add(key)
        return true
      })

      const customerMsgCounts = await getCustomerMessageCounts(store.id, candidates)
      const cartResults = await Promise.allSettled(
        candidates.map(cart => processSingleCart(cart, {
          campaign, store, subscription,
          sendDelayMs, followUpDelayMs, maxMessages, activeChannels, currencySymbol, abTest,
          optedOutEmails, optedOutPhones, customerLimits, customerMsgCounts,
          isPaidUser, cartOverageActive,
          voice, quietHoursStart, quietHoursEnd,
        }))
      )

      for (const cartResult of cartResults) {
        if (cartResult.status === 'fulfilled') {
          sent += cartResult.value.sent
          failed += cartResult.value.failed
        } else {
          failed++
          console.error(`Cart processing error:`, cartResult.reason)
        }
      }

      cartsProcessedForStore += candidates.length
      cursor = carts[carts.length - 1].id
    }

    return { sent, failed }
  } finally {
    await releasePerStoreLock(store.id)
  }
}

type CustomerMsgCounts = Map<string, { email: number; whatsapp: number }>

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
  customerLimits: { email: number; whatsapp: number }
  customerMsgCounts: CustomerMsgCounts
  isPaidUser: boolean
  cartOverageActive: boolean
  voice: BrandVoice
  quietHoursStart: number | null
  quietHoursEnd: number | null
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

  const counts = new Map<string, { email: number; whatsapp: number }>()
  for (const msg of messages) {
    const key = (msg.cart.customerEmail || msg.cart.customerPhone || '').toLowerCase().trim()
    if (!key) continue
    if (!counts.has(key)) counts.set(key, { email: 0, whatsapp: 0 })
    const entry = counts.get(key)!
    if (msg.channel === 'email') entry.email++
    else if (msg.channel === 'whatsapp') entry.whatsapp++
  }
  return counts
}

  async function processSingleCart(cart: any, config: CartConfig): Promise<{ sent: number; failed: number }> {
  const { campaign, store, subscription, sendDelayMs, followUpDelayMs, maxMessages, activeChannels, currencySymbol, abTest, optedOutEmails, optedOutPhones, customerLimits, customerMsgCounts, isPaidUser, cartOverageActive, voice, quietHoursStart, quietHoursEnd } = config

  try {
    // Resolve the A/B variant FIRST: its channels/delays/step-budget override the
    // campaign defaults, and every decision below (step guard, delay guard,
    // channel rotation) must use the variant's effective values. Previously the
    // adjusted values were computed here but never read, so an A/B test changed
    // nothing except the [AB:x] tag on the stored message record.
    let abTestVariant: string | null = null
    let effActiveChannels = [...activeChannels]
    let effSendDelayMs = sendDelayMs
    let effFollowUpDelayMs = followUpDelayMs
    let effMaxMessages = maxMessages

    if (abTest) {
      abTestVariant = makeAbTestVariant(cart.id)
      const variant = abTestVariant === 'A' ? abTest.variantA : abTest.variantB
      if (variant && typeof variant === 'object') {
        const cfg = variant as Record<string, any>
        if (Array.isArray(cfg.channels) && cfg.channels.length > 0) effActiveChannels = cfg.channels
        if (typeof cfg.sendDelay === 'number') effSendDelayMs = cfg.sendDelay * 60 * 1000
        if (typeof cfg.followUpDelay === 'number') effFollowUpDelayMs = cfg.followUpDelay * 60 * 1000
        if (typeof cfg.maxFollowUps === 'number') {
          effMaxMessages = Math.min(effActiveChannels.length, cfg.maxFollowUps + 1)
        }
      }
    }

    // A step only counts once a message for it was ACCEPTED by the provider.
    // Using the raw message count meant a failed send consumed the step, so
    // the sequence moved on and the customer never got a retry.
    const completedMessages = cart.messages.filter((m: any) => m.status === 'sent' || m.status === 'delivered')
    const step = completedMessages.length
    if (step >= effMaxMessages) return { sent: 0, failed: 0 }

    // Quiet hours: never message a customer inside the merchant's local quiet
    // window. The cart stays eligible and is picked up after the window.
    if (
      isWithinQuietHours(new Date(), { start: quietHoursStart ?? -1, end: quietHoursEnd ?? -1 })
    ) {
      return { sent: 0, failed: 0 }
    }

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

    const requiredDelayMs = effSendDelayMs + step * effFollowUpDelayMs
    if (Date.now() - cart.abandonedAt.getTime() < requiredDelayMs) return { sent: 0, failed: 0 }

    const scheduledChannel = effActiveChannels[step % effActiveChannels.length]
    const channelOrder = [
      scheduledChannel,
      ...effActiveChannels.filter(c => c !== scheduledChannel),
    ]

    const availableChannels = channelOrder.filter(c => {
      // A channel is "used" only when a message on it was actually accepted.
      // A failed attempt must stay retryable (same step, same row).
      if (cart.messages.some((m: any) => m.channel === c && (m.status === 'sent' || m.status === 'delivered'))) return false
      if (c === 'email') return Boolean(cart.customerEmail)
      if (c === 'whatsapp') return Boolean(cart.customerPhone)
      return false
    })

    if (availableChannels.length === 0) return { sent: 0, failed: 0 }

    const customerEmail = cart.customerEmail?.toLowerCase().trim()
    const customerPhone = cart.customerPhone?.replace(/\D/g, '')

    if (customerEmail && optedOutEmails.has(customerEmail)) return { sent: 0, failed: 0 }
    // Opt-out is per-contact and channel-agnostic: a customer who unsubscribed
    // on their phone must be suppressed even when we also hold their email.
    // The old `!customerEmail` guard let any cart carrying both a phone-opted-out
    // number AND an email slip through to WhatsApp.
    if (customerPhone && optedOutPhones.has(customerPhone)) return { sent: 0, failed: 0 }

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
      console.log(`📵 Customer ${redactSensitive(customerKey)}: reached limit for ${limitedChannels.join(', ')} (plan limit: ${JSON.stringify(customerLimits)})`)
    }

    // Overage is automatic for paid plans: once a customer hits the plan's
    // per-customer per-channel cap, the extra messages are still sent and
    // recorded on `overageMessages` for the next invoice (₹1 each). There is no
    // merchant opt-in toggle — paid plans are metered, free plans hard-stop.
    const overageEligible = isPaidUser
    const channelsToProcess = overageEligible ? availableChannels : allowedChannels
    const isOverageChannel = (ch: string): boolean => channelLimited(ch)

    // A cart only owes cart-overage the first time it is messaged within the
    // current billing period; follow-up cycles on the same cart are already
    // counted in the period's cart usage.
    const periodStartMs = subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart).getTime() : 0
    const isNewCartInPeriod =
      cartOverageActive &&
      !cart.messages.some((m: any) => m.status === 'sent' && m.sentAt && new Date(m.sentAt).getTime() >= periodStartMs)

    if (channelsToProcess.length === 0) return { sent: 0, failed: 0 }

    const customerName = cart.customerName || 'Valued Customer'
    const rawItems = Array.isArray(cart.items) ? (cart.items as any[]) : []
    // Captures made before images were stored carry no photo (and older
    // checkouts only had `image_url`, which the old mapper ignored). Resolve
    // the product's real photo now — by product id when needed — so both the
    // email thumbnails and the WhatsApp header show what the shopper left
    // behind instead of the CartGain logo.
    const enriched = await enrichCartItemsWithImages(store, rawItems)
    if (enriched.changed) {
      prisma.cart
        .update({ where: { id: cart.id }, data: { items: enriched.items as any } })
        .catch(() => {})
    }
    const cartItems = enriched.items as { name: string; description?: string; price: number; quantity: number; image?: string; productId?: string }[]
    const formattedTotal = `${currencySymbol}${cart.totalValue.toFixed(2)}`

    // ── The offer ──────────────────────────────────────────────────────────
    // Resolved from MERCHANT configuration before any copy is written. A code
    // is only used when it actually exists in the store (campaign code or a
    // freshly created Shopify discount); otherwise the message goes out with
    // no offer rather than a code that fails at checkout.
    const offer = await resolveRecoveryOffer({
      campaign: {
        discountEnabled: campaign.discountEnabled,
        discountType: campaign.discountType,
        discountValue: campaign.discountValue,
        discountCode: campaign.discountCode,
      },
      store,
      cartId: cart.id,
      cartTotal: cart.totalValue,
    }).catch((err) => {
      console.error('Recovery offer resolution failed:', err?.message || err)
      return null
    })

    const discountCode: string | undefined = offer?.code
    const discountValue: number | undefined = offer?.value
    const discountType: string | undefined = offer?.type

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

    const appUrlBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

    // The offer is whatever the pricing layer authorised above — the copy layer
    // may DESCRIBE it, never invent or alter it.
    const authorisedDiscount: ConversationDiscount | null =
      discountCode && typeof discountValue === 'number'
        ? {
            code: discountCode,
            value: discountValue,
            type:
              discountType === 'percentage'
                ? 'percentage'
                : discountType === 'free_shipping'
                  ? 'free_shipping'
                  : 'fixed',
          }
        : null

    // Deterministic, pre-recorded links for every channel. `checkout` goes
    // through our redirect and then to the store with the code applied.
    const linkFor = (ch: string, kind: 'cart' | 'bargain' | 'checkout') =>
      buildRecoveryLink({
        appUrl: appUrlBase,
        cartId: cart.id,
        channel: ch === 'email' ? 'email' : 'whatsapp',
        kind,
        discountCode: kind === 'checkout' ? authorisedDiscount?.code : null,
      })

    // Previous copy sent to this cart, so step N does not repeat step N-1.
    const previousMessage =
      completedMessages
        .slice()
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        ?.content ?? null

    let globalSendSuccess = false
    for (const ch of channelsToProcess) {
      const cartUrl = linkFor(ch, 'cart')

      // ── Idempotency ────────────────────────────────────────────────────
      // One row per (cart, channel, step). A fresh 'pending' row belongs to a
      // concurrent worker; a sent/delivered row was already accepted. A stale
      // pending row (>10 min) or a failed row is reused, so a retry sends
      // exactly once.
      const existingMessage: any = cart.messages.find((m: any) => m.channel === ch && m.step === step)
      if (existingMessage && (existingMessage.status === 'sent' || existingMessage.status === 'delivered')) {
        continue
      }
      const stalePending =
        existingMessage?.status === 'pending' &&
        Date.now() - new Date(existingMessage.createdAt).getTime() > 10 * 60 * 1000
      if (existingMessage?.status === 'pending' && !stalePending) {
        continue
      }

      let sendSuccess = false
      let error = ''
      let providerId: string | undefined

      try {
        // ── Compose (validated) copy ────────────────────────────────────
        const composed = await composeRecoveryMessage({
          storeId: store.id,
          storeName: store.name,
          currencySymbol,
          customerName,
          items: cartItems.map((item: any) => ({
            name: item.name,
            price: Number(item.price) || 0,
            quantity: Number(item.quantity) || 1,
            description: item.description,
          })),
          total: cart.totalValue,
          cartUrl,
          discount: authorisedDiscount,
          channel: ch as 'email' | 'whatsapp',
          step,
          voice,
          previousMessage,
        })

        // ── Claim the step BEFORE sending ───────────────────────────────
        let messageId: string
        const claim = {
          cartId: cart.id,
          campaignId: campaign.id,
          channel: ch,
          step,
          // Store what the customer actually receives: WhatsApp gets the
          // single-line body with the redundant greeting stripped (the
          // template already greets with {{1}}), email gets the full body.
          content:
            ch === 'whatsapp'
              ? singleLineMessage(stripLeadingGreeting(composed.body, customerName))
              : composed.body,
          status: 'pending',
          sentAt: null,
          deliveredAt: null,
          variant: composed.variant,
          promptVersion: composed.promptVersion,
          providerId: null,
        }
        try {
          if (existingMessage) {
            await prisma.message.update({
              where: { id: existingMessage.id },
              data: { ...claim, createdAt: new Date() },
            })
            messageId = existingMessage.id
          } else {
            const created = await prisma.message.create({ data: claim })
            messageId = created.id
          }
        } catch (claimErr: any) {
          if (claimErr?.code === 'P2002') {
            // Another worker claimed this cart/channel/step first.
            continue
          }
          throw claimErr
        }

        if (composed.source === 'fallback' && composed.issues.some((i) => i.severity === 'block')) {
          console.warn(
            `[recovery] copy validator blocked model output for cart ${cart.id} (${ch}); sent fact-only template`,
          )
        }

        if (ch === 'email') {
          const emailHtml = EmailTemplates.abandoned(
            customerName,
            cartItems,
            cart.totalValue,
            cartUrl,
            store.name,
            currencySymbol,
            composed.body,
            buildOptOutUrl(appUrlBase, { storeId: store.id, email: cart.customerEmail }),
            {
              emoji: voice.emojiIntensity !== 'off',
              offer: authorisedDiscount,
              checkoutUrl: linkFor('email', 'checkout'),
              bargainUrl: linkFor('email', 'bargain'),
            },
          )
          const emailResult = await sendEmail({
            to: cart.customerEmail!,
            subject: composed.subject || `${customerName}, your cart is still saved`,
            html: emailHtml,
            text: composed.body,
          })
          sendSuccess = emailResult.success
          providerId = emailResult.messageId
          if (!sendSuccess) error = emailResult.error || 'Unknown error'
        } else {
          const firstImage = getFirstProductImage(cartItems)
          // A CartGain-logo header means the product photo could not be
          // resolved (no captured image and no product id to look up). Log the
          // outcome so "why is the logo on my message" is answerable from logs.
          console.log(
            `[recovery] cart=${cart.id} whatsapp header=${firstImage ? 'product-photo' : 'fallback-image'}`,
          )
          const templateStep = Math.min(step, 2)
          const templateMap = [
            WhatsAppTemplates.abandoned_cart,
            WhatsAppTemplates.abandoned_cart_followup,
            WhatsAppTemplates.abandoned_cart_urgent,
          ]

          // {{3}} is the offer line. It always carries a working link: the
          // store checkout with the code applied (when there is a code) and the
          // negotiation link. Without an offer it still carries a live link, so
          // the variable is never empty and the shopper always has a next step.
          const offerValueLabel = authorisedDiscount
            ? authorisedDiscount.type === 'percentage'
              ? `${authorisedDiscount.value}% off`
              : authorisedDiscount.type === 'free_shipping'
                ? 'free shipping'
                : `${currencySymbol}${authorisedDiscount.value} off`
            : ''
          const checkoutLink = linkFor('whatsapp', 'checkout')
          const bargainLink = linkFor('whatsapp', 'bargain')
          // Personal offer line: the customer's name, the product they chose
          // and their own single-use code. No invented urgency, no generic
          // "USE CODE" blast.
          const firstName = (customerName || '').split(' ')[0]?.trim()
          const greetingPrefix = firstName ? `${firstName}, ` : ''
          const productSummary = formatProductList(cartItems, 2)
          const offerLine = authorisedDiscount
            ? `${greetingPrefix}your ${productSummary} gets ${offerValueLabel} — code ${authorisedDiscount.code}: ${checkoutLink} — or name your price: ${bargainLink}`
            : `${greetingPrefix}your ${productSummary} is still saved — finish your order: ${checkoutLink} — or name your price: ${bargainLink}`

          const template = templateMap[templateStep]
          const params = template.generateParams(
            customerName,
            // The template greets with {{1}}; a body that greets again stutters.
            singleLineMessage(stripLeadingGreeting(composed.body, customerName)),
            offerLine,
            firstImage,
            {
              buttonUrlSuffix: process.env.WHATSAPP_TEMPLATE_BUTTON_BASE
                ? `${cart.id}?c=whatsapp`
                : undefined,
            },
          )
          const whatsappResult = await sendWhatsAppMessage({
            to: sanitizePhoneNumber(cart.customerPhone!),
            templateName: template.name,
            templateParams: params,
          })
          sendSuccess = whatsappResult.success
          providerId = whatsappResult.messageId
          if (!sendSuccess) error = whatsappResult.error || 'Unknown error'
        }

        // ── Record the real outcome ────────────────────────────────────
        // 'sent' means the provider accepted it. 'delivered' is set only by a
        // provider delivery receipt (WhatsApp status webhook / email webhook).
        await prisma.message.update({
          where: { id: messageId },
          data: {
            status: sendSuccess ? 'sent' : 'failed',
            sentAt: sendSuccess ? new Date() : null,
            providerId: providerId ?? null,
          },
        })
      } catch (err: any) {
        console.error(`Error sending ${ch} for cart ${cart.id}:`, err?.message || err)
        error = err.message
      }

      if (sendSuccess) {
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
          if (isNewCartInPeriod) {
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: { cartOverage: { increment: 1 } },
            })
            subscription.cartOverage = (subscription.cartOverage ?? 0) + 1
          }
        }
        const today = new Date(new Date().toDateString())
        const channelCounts = {
          whatsappCount: ch === 'whatsapp' ? 1 : 0,
          emailCount: ch === 'email' ? 1 : 0,
        }
        await prisma.analytics.upsert({
          where: { userId_date: { userId: campaign.userId, date: today } },
          update: { messagesSent: { increment: 1 }, ...channelCounts },
          create: { userId: campaign.userId, date: today, messagesSent: 1, ...channelCounts },
        })
        await track({
          name: 'cartgain_recovery_message_sent',
          userId: campaign.userId,
          storeId: store.id,
          properties: {
            channel: ch,
            aiOptimized: campaign.aiOptimized,
            discountEnabled: campaign.discountEnabled,
            step,
          },
        })
        break
      } else {
        console.error(`Failed to send ${ch} message for cart ${cart.id}: ${error || 'unknown error'}`)
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
  campaignCursor?: string
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
    if (campaignCursor) {
      // The cursor is a CAMPAIGN id, not a store id. A store can legitimately
      // have more than one active campaign (duplicate/legacy rows); keying on
      // store id made `findIndex` match the FIRST duplicate and `slice(+1)`
      // restart at the SECOND, so the cursor could never advance past that
      // store — every later store (e.g. the only active one) was starved
      // forever. Campaign ids are unique, so the rotation always advances.
      const cursorIdx = campaigns.findIndex(c => c.id === campaignCursor)
      if (cursorIdx >= 0) {
        targetCampaigns = campaigns.slice(cursorIdx + 1)
        // Wrap around: after the last campaign the next cycle must restart from
        // the first, otherwise a single-campaign (or last-in-list) deployment
        // sits idle until the Redis cursor TTL expires — recovery stalls.
        if (targetCampaigns.length === 0) targetCampaigns = campaigns
      }
    }

    // Process as many stores as fit in the time budget instead of exactly one.
    // A single store per invocation starved every other merchant whenever the
    // trigger slipped (GitHub schedules are frequently late), so recovery
    // stalled for hours. The route's maxDuration is 60s; leave headroom.
    const budgetMs = Number(process.env.CART_SWEEP_BUDGET_MS || 35000)
    const batch: typeof targetCampaigns = []
    for (const campaign of targetCampaigns) {
      if (batch.length > 0 && Date.now() - startTime > budgetMs) break
      batch.push(campaign)
    }
    const finishedRotation = batch.length === targetCampaigns.length
    const results: PromiseSettledResult<{ sent: number; failed: number }>[] = []

    for (const campaign of batch) {
      const r = await Promise.allSettled([processStore(campaign, limit)])
      results.push(...r)
      if (r[0]?.status === 'fulfilled') storesProcessed++
      nextCursor = campaign.id
    }
    // A completed rotation restarts from the top next run; only a budget cut
    // keeps a cursor, so no store is skipped or double-served.
    if (finishedRotation) nextCursor = undefined

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
      console.log(`✅ Processed ${processedCount} carts from ${storesProcessed} store(s) (${messagesSent} sent, ${messagesFailed} failed) in ${elapsed}ms. Next cursor: ${nextCursor ?? 'restart'}`)
    } else {
      console.log(`⏸️ No stores to process — ${campaigns.length} campaigns exist, cursor: ${campaignCursor || 'start'}`)
      nextCursor = undefined
    }

    return { processedCarts: processedCount, messagesSent, messagesFailed, nextCursor, storesProcessed }
  } catch (err) {
    console.error('Fatal error in processAbandonedCarts:', err)
    return { processedCarts: processedCount, messagesSent, messagesFailed, nextCursor, storesProcessed }
  }
}
