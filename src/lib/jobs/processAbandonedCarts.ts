import prisma from '@/lib/db'
import { logDataAccess, redactSensitive } from '@/lib/data-protection'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { buildOptOutUrl } from '@/lib/opt-out'
import { sanitizePhoneNumber } from '@/lib/utils'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
import {
  isConfigWhatsAppFailure,
  isEngagementLimitedReason,
  isEngagementLimitedWhatsAppFailure,
  isPermanentWhatsAppFailure,
} from '@/lib/whatsapp/errors'
import { resolveRecoveryOffer } from '@/lib/recovery/offer'
import { enrichCartItemsWithImages } from '@/lib/recovery/product-image'
import { buildRecoveryLink } from '@/lib/recovery/links'
import { getRecoveryShortLink } from '@/lib/recovery/short-links'
import { buildRecoveryOfferLine } from '@/lib/recovery/offer-line'
import { composeRecoveryMessage, singleLineMessage, stripLeadingGreeting } from '@/lib/conversation/recovery'
import type { ConversationDiscount } from '@/lib/conversation/facts'
import { isWithinQuietHours } from '@/lib/conversation/variety'
import { resolveVoice } from '@/lib/conversation/voice'
import type { BrandVoice } from '@/lib/conversation/voice'
import { loadStoreVoiceSettings } from '@/lib/conversation/store'
import { releaseLock } from '@/lib/job-lock'
import { redisSetNX, redisIncr, redisGet, redisExpire, getRedis } from '@/lib/redis'
import { FREE_CARTS_THRESHOLD, PLANS, getPlan } from '@/lib/payment'
import { evaluateSubscriptionEntitlement } from '@/lib/subscription-entitlement'
import { track } from '@/lib/analytics/track'
import {
  evaluateWhatsAppEligibility,
  normalizeWhatsAppPhone,
  type WhatsAppEligibilityResult,
} from '@/lib/recovery/eligibility'
import {
  canSendRecoveryEmail,
  ensureRecipientForCart,
  markRecipientContacted,
} from '@/lib/recovery/recipients'
import { isWhatsAppConfigured } from '@/lib/whatsapp/config'
import { decideWhatsAppMessage } from '@/lib/whatsapp/decision'
import {
  buildRecoverySequence,
  resolveNextStep,
  isStepDue,
  evaluateCampaignStop,
  MAX_ROUNDS,
} from '@/lib/recovery/sequence'
import { findShopifyCustomerContact } from '@/lib/shopify'
import { cleanCustomerName } from '@/lib/names'

const MAX_STORE_CONCURRENCY = 10
const MAX_CARTS_PER_STORE = 300
const PER_STORE_LOCK_TTL = 4 * 60 * 1000
// Transient provider failures are retried with exponential backoff instead of
// every sweep (which used to hammer a broken credential every five minutes).
// Permanent WhatsApp failures (number not on WhatsApp, template rejected) are
// marked skipped so the sequence advances to the next configured step, which is
// sent on its own schedule rather than in the same sweep.
const DEFAULT_MAX_SEND_ATTEMPTS = 5
const DEFAULT_RETRY_BASE_MS = 5 * 60 * 1000
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000

function maxSendAttempts(): number {
  const n = Number(process.env.RECOVERY_MAX_SEND_ATTEMPTS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_SEND_ATTEMPTS
}

function retryDelayMs(attempts: number): number {
  const base = Number(process.env.RECOVERY_RETRY_BASE_MS)
  const safeBase = Number.isFinite(base) && base > 0 ? base : DEFAULT_RETRY_BASE_MS
  return Math.min(MAX_RETRY_DELAY_MS, safeBase * 2 ** Math.max(0, attempts - 1))
}

/**
 * Mark a step as `skipped` so the sequence can advance past a channel that
 * cannot deliver to this contact (missing phone, no email basis, per-customer
 * cap, opt-out). The reason is persisted for the dashboard timeline. Safe to
 * call when the row already exists.
 */
async function recordSkippedStep(
  cartMessages: any[],
  input: { cartId: string; campaignId: string; channel: string; step: number; reason: string },
): Promise<void> {
  const existing = cartMessages.find(
    (m: any) => m.channel === input.channel && m.step === input.step,
  )
  try {
    if (existing) {
      if (existing.status === 'sent' || existing.status === 'delivered') return
      await prisma.message.update({
        where: { id: existing.id },
        data: { status: 'skipped', reasonCode: input.reason },
      })
      return
    }
    await prisma.message.create({
      data: {
        cartId: input.cartId,
        campaignId: input.campaignId,
        channel: input.channel,
        step: input.step,
        content: '',
        status: 'skipped',
        reasonCode: input.reason,
      },
    })
  } catch (err: any) {
    // A concurrent worker already created the row — leave it.
    if (err?.code === 'P2002') return
    console.error(
      `[recovery] failed to record skipped step for cart ${input.cartId}:`,
      err?.message || err,
    )
  }
}


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

/**
 * Ask Shopify's CDN for a compact square crop for the WhatsApp header. The
 * template's image header is unavoidable and WhatsApp renders it full width, so
 * a square thumbnail keeps it from dominating the message and pushing the text
 * behind "Read more".
 */
function compactWhatsAppHeaderImage(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('width')) parsed.searchParams.set('width', '400')
    if (!parsed.searchParams.has('height')) parsed.searchParams.set('height', '400')
    if (!parsed.searchParams.has('crop')) parsed.searchParams.set('crop', 'center')
    return parsed.toString()
  } catch {
    return url
  }
}

function recipientKey(kind: 'phone' | 'email' | 'customer', value: string): string {
  return `${kind}:${value}`
}

function normalizeRecipientEmailKey(email: string | null | undefined): string | null {
  if (!email) return null
  const normalized = email.trim().toLowerCase()
  return normalized || null
}

function findRecipientForCart(recipients: Map<string, any>, cart: any): any | null {
  const phone = normalizeWhatsAppPhone(cart.customerPhone)
  if (phone) {
    const match = recipients.get(recipientKey('phone', phone))
    if (match) return match
  }
  const email = normalizeRecipientEmailKey(cart.customerEmail)
  if (email) {
    const match = recipients.get(recipientKey('email', email))
    if (match) return match
  }
  if (cart.customerId) {
    const match = recipients.get(recipientKey('customer', String(cart.customerId)))
    if (match) return match
  }
  return null
}

/**
 * Load the consent records for this batch in ONE query. Missing contacts are
 * registered with consent=false (never inferred) so the dashboard has a
 * complete list and the skip reason is visible. A DB failure fails closed: no
 * registry means no WhatsApp send.
 */
async function getRecipientMap(storeId: string, carts: any[]): Promise<Map<string, any>> {
  const OR: Array<Record<string, any>> = []

  for (const cart of carts) {
    const phone = normalizeWhatsAppPhone(cart.customerPhone)
    const email = normalizeRecipientEmailKey(cart.customerEmail)
    if (phone) OR.push({ phone })
    if (email) OR.push({ email })
    if (cart.customerId) OR.push({ shopifyCustomerId: String(cart.customerId) })
  }

  if (OR.length === 0) return new Map()

  let rows: any[] = []
  try {
    rows = await prisma.customerIdentity.findMany({ where: { storeId, OR } })
  } catch (err: any) {
    console.error(`[recovery] recipient lookup failed for store ${storeId} — WhatsApp blocked:`, err?.message || err)
    return new Map()
  }

  const map = new Map<string, any>()
  const index = (row: any) => {
    const phone = normalizeWhatsAppPhone(row.phone)
    const email = normalizeRecipientEmailKey(row.email)
    if (phone) map.set(recipientKey('phone', phone), row)
    if (email) map.set(recipientKey('email', email), row)
    if (row.shopifyCustomerId) map.set(recipientKey('customer', String(row.shopifyCustomerId)), row)
  }
  rows.forEach(index)

  for (const cart of carts) {
    if (findRecipientForCart(map, cart)) continue
    const created = await ensureRecipientForCart(storeId, cart).catch(() => null)
    if (created) index(created)
  }

  return map
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

    const entitlement = evaluateSubscriptionEntitlement(subscription)
    const isPaidUser = entitlement.isPaid

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
      ? getPlan(entitlement.effectivePlanId)
      : PLANS.FREE
    const customerLimits = planConfig.maxMessagesPerCustomer

    const channels = (campaign.channels.length > 0 ? campaign.channels : ['whatsapp', 'email'])
      .filter((c: string) => c === 'email' || c === 'whatsapp')
    if (channels.length !== campaign.channels.length) {
      console.warn(
        `[recovery] campaign=${campaign.id} ignored unsupported channels: ${campaign.channels.filter((c: string) => c !== 'email' && c !== 'whatsapp').join(', ')}`,
      )
    }
    let sendDelayMs = campaign.sendDelay * 60 * 1000
    let followUpDelayMs = campaign.followUpDelay * 60 * 1000
    // One "round" touches every usable channel (WhatsApp AND email on the
    // first round, then the follow-up round). The old budget counted messages,
    // so a two-channel campaign could only ever send two messages: the email
    // reminder was pushed hours later and the per-channel caps (email 3 /
    // WhatsApp 2) were unreachable.
    let maxRounds = Math.max(1, Math.min(5, campaign.maxFollowUps))
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
      const recipients = await getRecipientMap(store.id, candidates)
      const cartResults = await Promise.allSettled(
        candidates.map(cart => processSingleCart(cart, {
          campaign, store, subscription,
          sendDelayMs, followUpDelayMs, maxRounds, activeChannels, currencySymbol, abTest,
          optedOutEmails, optedOutPhones, customerLimits, customerMsgCounts,
          isPaidUser, cartOverageActive,
          voice, quietHoursStart, quietHoursEnd, recipients,
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
  maxRounds: number
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
  recipients: Map<string, any>
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
  const { campaign, store, subscription, sendDelayMs, followUpDelayMs, maxRounds, activeChannels, currencySymbol, abTest, optedOutEmails, optedOutPhones, customerLimits, customerMsgCounts, isPaidUser, cartOverageActive, voice, quietHoursStart, quietHoursEnd, recipients } = config

  try {
    // A purchase may land between the sweep's SELECT and this cart's turn.
    // Never message a cart that has already converted.
    if (cart.convertedAt || cart.isRecovered) return { sent: 0, failed: 0 }

    // Resolve the A/B variant FIRST: its channels/delays/step-budget override the
    // campaign defaults, and every decision below (step guard, delay guard,
    // channel rotation) must use the variant's effective values. Previously the
    // adjusted values were computed here but never read, so an A/B test changed
    // nothing except the [AB:x] tag on the stored message record.
    let abTestVariant: string | null = null
    let effActiveChannels = [...activeChannels]
    let effSendDelayMs = sendDelayMs
    let effFollowUpDelayMs = followUpDelayMs
    let effMaxRounds = maxRounds

    if (abTest) {
      abTestVariant = makeAbTestVariant(cart.id)
      const variant = abTestVariant === 'A' ? abTest.variantA : abTest.variantB
      if (variant && typeof variant === 'object') {
        const cfg = variant as Record<string, any>
        if (Array.isArray(cfg.channels) && cfg.channels.length > 0) effActiveChannels = cfg.channels
        if (typeof cfg.sendDelay === 'number') effSendDelayMs = cfg.sendDelay * 60 * 1000
        if (typeof cfg.followUpDelay === 'number') effFollowUpDelayMs = cfg.followUpDelay * 60 * 1000
        if (typeof cfg.maxFollowUps === 'number') {
          effMaxRounds = Math.max(1, Math.min(5, cfg.maxFollowUps))
        }
      }
    }

    // A step is terminal once its message was accepted (`sent`/`delivered`) or
    // deliberately `skipped` (channel unreachable / blocked for this contact).
    // A `failed` message is NOT terminal: the step stays current so it can be
    // retried with backoff instead of being skipped over.
    const completedMessages = cart.messages.filter(
      (m: any) => m.status === 'sent' || m.status === 'delivered',
    )
    const recipient = findRecipientForCart(recipients, cart)
    const contactEmail = cart.customerEmail || recipient?.email || null
    // An email address is not a name. Older captures sometimes stored the
    // shopper's email in customerName, which produced "Hey, shopper@..." in
    // every greeting. Treat it as missing and recover the real name.
    let resolvedName = cleanCustomerName(cart.customerName, contactEmail)
    if (!resolvedName) {
      resolvedName = cleanCustomerName(recipient?.name, contactEmail)
    }
    // A signed-in Shopify customer already has a name and phone on their
    // profile. Look them up when the cart omits either, so recovery can send
    // without the shopper re-entering anything in our widget or the checkout.
    let contact: Awaited<ReturnType<typeof findShopifyCustomerContact>> = null
    if ((!resolvedName || !cart.customerPhone) && (contactEmail || cart.customerId)) {
      contact = await findShopifyCustomerContact(store, {
        email: contactEmail,
        customerId: cart.customerId,
      }).catch(() => null)
      resolvedName = resolvedName || cleanCustomerName(contact?.name, contactEmail || contact?.email)
    }
    if (resolvedName && resolvedName !== cart.customerName) {
      cart.customerName = resolvedName
      prisma.cart
        .update({ where: { id: cart.id }, data: { customerName: resolvedName } })
        .catch(() => {})
    }
    // Shopify checkouts often omit the phone. Prefer the recipient registry,
    // then the authoritative Shopify customer profile, and backfill the cart so
    // later rounds and the dashboard show the same number.
    const whatsappPhone =
      cart.customerPhone || recipient?.phone || contact?.phone || null
    if (whatsappPhone && !cart.customerPhone) {
      cart.customerPhone = whatsappPhone
      prisma.cart
        .update({ where: { id: cart.id }, data: { customerPhone: whatsappPhone } })
        .catch(() => {})
    }
    if (!cart.customerEmail && (recipient?.email || contact?.email)) {
      cart.customerEmail = recipient?.email || contact?.email || null
    }
    const cartPhoneDigits = whatsappPhone ? sanitizePhoneNumber(whatsappPhone) : ''
    // An unsubscribe is channel-agnostic. The OptOut tables cover recorded
    // unsubscribes; a suppressed identity is the authoritative record and must
    // stop email too, not just WhatsApp.
    if (recipient?.suppressed || recipient?.optedOutAt) {
      return { sent: 0, failed: 0 }
    }
    const whatsappEligibility: WhatsAppEligibilityResult = evaluateWhatsAppEligibility({
      phone: whatsappPhone,
      identity: recipient,
      cartConverted: Boolean(cart.convertedAt || cart.isRecovered),
      storeActive: store.isActive !== false,
      whatsappConfigured: isWhatsAppConfigured(),
      onOptOutList: Boolean(cartPhoneDigits && optedOutPhones.has(cartPhoneDigits)),
    })
    if (whatsappEligibility.eligible && !cart.customerPhone && whatsappPhone) {
      cart.customerPhone = whatsappPhone
      try {
        await prisma.cart.update({
          where: { id: cart.id },
          data: { customerPhone: whatsappPhone },
        })
      } catch {
        // Best-effort backfill: the current sweep can still send with the
        // identity phone even if persisting it fails.
      }
    }
    if (
      !whatsappEligibility.eligible &&
      effActiveChannels.includes('whatsapp') &&
      (whatsappPhone || whatsappEligibility.code === 'whatsapp_not_configured')
    ) {
      console.log(
        `[recovery] cart=${cart.id} whatsapp skipped: ${whatsappEligibility.code} (${whatsappEligibility.reason})`,
      )
    }

    // Email is transactional for a cart: the shopper gave the address to
    // complete an order, so a follow-up about that cart is allowed until they
    // unsubscribe. WhatsApp still requires explicit consent. A contact who only
    // opted into WhatsApp (basis `none`) is not emailed.
    const emailReachable = Boolean(cart.customerEmail) && canSendRecoveryEmail(recipient)
    if (cart.customerEmail && !emailReachable && effActiveChannels.includes('email')) {
      const reason = recipient?.suppressed || recipient?.optedOutAt
        ? 'email_suppressed'
        : recipient
          ? 'no_email_basis'
          : 'no_recipient_record'
      console.log(`[recovery] cart=${cart.id} email skipped: ${reason}`)
    }

    // ── Centralized campaign sequence ──────────────────────────────────
    // The merchant's channel order is the source of truth. The sequence is a
    // flat list of (channel, scheduledAt) steps; this sweep sends only the NEXT
    // due step, on ONE channel. That is what prevents email + WhatsApp firing
    // together and guarantees the configured order (email → WhatsApp → follow-up).
    const sequence = buildRecoverySequence(
      {
        channels: effActiveChannels,
        maxFollowUps: effMaxRounds,
        sendDelay: effSendDelayMs / 60000,
        followUpDelay: effFollowUpDelayMs / 60000,
      },
      cart.abandonedAt,
      { maxRounds: MAX_ROUNDS },
    )
    const next = resolveNextStep(sequence, cart.messages)
    const expiryDaysRaw = Number(process.env.RECOVERY_CAMPAIGN_EXPIRY_DAYS ?? 14)
    const expiryDays = Number.isFinite(expiryDaysRaw) ? expiryDaysRaw : 14
    const stopReason = evaluateCampaignStop({
      cart,
      identity: recipient,
      next,
      abandonedAt: cart.abandonedAt,
      now: new Date(),
      expiryDays,
    })
    if (stopReason || next.done) return { sent: 0, failed: 0 }

    const step = next.step.index
    const channel = next.step.channel

    // Quiet hours: never message a customer inside the merchant's local quiet
    // window. The cart stays eligible and is picked up after the window.
    if (
      isWithinQuietHours(new Date(), { start: quietHoursStart ?? -1, end: quietHoursEnd ?? -1 })
    ) {
      return { sent: 0, failed: 0 }
    }

    // Never send a step before its scheduled moment. The sequence builder floors
    // the gap between steps at 30 minutes, so a misconfigured campaign cannot
    // spam. This is also the mechanism that stops email and WhatsApp firing in
    // the same sweep.
    if (!isStepDue(next.step, new Date())) return { sent: 0, failed: 0 }

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

    // Resolve whether THIS step's channel can deliver. An unreachable channel is
    // recorded as `skipped` (with an explainable reason) so the sequence
    // advances instead of wedging forever on a channel that cannot work.
    let channelSkipReason: string | null = null
    if (channel === 'email') {
      if (!emailReachable) {
        channelSkipReason = recipient?.suppressed || recipient?.optedOutAt
          ? 'email_suppressed'
          : recipient
            ? 'no_email_basis'
            : 'no_recipient_record'
      }
    } else {
      if (!whatsappPhone) channelSkipReason = 'missing_phone'
      else if (!whatsappEligibility.eligible) channelSkipReason = whatsappEligibility.code
    }

    if (channelSkipReason) {
      // A step whose channel cannot deliver is recorded as skipped and the
      // sequence advances on its own schedule. The next configured channel is
      // never sent from inside this sweep — that is what caused email and
      // WhatsApp to fire together.
      await recordSkippedStep(cart.messages, {
        cartId: cart.id,
        campaignId: campaign.id,
        channel,
        step,
        reason: channelSkipReason,
      })
      console.log(`[recovery] cart=${cart.id} step=${step} ${channel} skipped: ${channelSkipReason}`)
      return { sent: 0, failed: 0 }
    }

    const availableChannels = [channel]

    const customerEmail = cart.customerEmail?.toLowerCase().trim()
    const customerPhone = whatsappPhone?.replace(/\D/g, '')

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

    if (channelLimited(channel)) {
      console.log(`📵 Customer ${redactSensitive(customerKey)}: reached limit for ${channel} (plan limit: ${JSON.stringify(customerLimits)})`)
    }

    // Overage is automatic for paid plans: once a customer hits the plan's
    // per-customer per-channel cap, the extra messages are still sent and
    // recorded on `overageMessages` for the next invoice (₹1 each). There is no
    // merchant opt-in toggle — paid plans are metered, free plans hard-stop.
    const overageEligible = isPaidUser
    // Free plan at the per-customer cap: record the step as skipped so the
    // sequence can advance to its next channel/round instead of wedging on this
    // one forever. The reason is surfaced in the dashboard.
    if (!overageEligible && channelLimited(channel)) {
      await recordSkippedStep(cart.messages, {
        cartId: cart.id,
        campaignId: campaign.id,
        channel,
        step,
        reason: 'customer_limit_reached',
      })
      return { sent: 0, failed: 0 }
    }
    const isOverageChannel = (ch: string): boolean => channelLimited(ch)

    // A cart only owes cart-overage the first time it is messaged within the
    // current billing period; follow-up cycles on the same cart are already
    // counted in the period's cart usage.
    const periodStartMs = subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart).getTime() : 0
    const isNewCartInPeriod =
      cartOverageActive &&
      !cart.messages.some((m: any) => m.status === 'sent' && m.sentAt && new Date(m.sentAt).getTime() >= periodStartMs)


    // Never pass a placeholder or an email address into the AI: it will greet
    // the shopper as "Valued" or "shopper@example.com". No name is better than
    // a fake one, and the template already has a neutral fallback ("there").
    const personalName =
      cleanCustomerName(cart.customerName, cart.customerEmail) ||
      cleanCustomerName(recipient?.name, cart.customerEmail) ||
      undefined
    const firstName = personalName?.split(/\s+/)[0]?.trim() || undefined
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
    // through our redirect and then to the store with the code applied. The
    // short link keeps WhatsApp messages compact (and fits Meta's 15-character
    // dynamic-button limit); storage failures fall back to the long URL.
    const linkFor = async (ch: string, kind: 'cart' | 'bargain' | 'checkout') => {
      const channel = ch === 'email' ? 'email' : 'whatsapp'
      const short = await getRecoveryShortLink({
        appUrl: appUrlBase,
        cartId: cart.id,
        channel,
        kind,
        discountCode: kind === 'checkout' ? authorisedDiscount?.code : null,
      }).catch(() => null)
      if (short) return short
      return {
        code: '',
        url: buildRecoveryLink({
          appUrl: appUrlBase,
          cartId: cart.id,
          channel,
          kind,
          discountCode: kind === 'checkout' ? authorisedDiscount?.code : null,
        }),
      }
    }

    // Previous copy sent to this cart, so step N does not repeat step N-1.
    const previousMessage =
      completedMessages
        .slice()
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        ?.content ?? null

    // ── Send exactly ONE step (one channel) this sweep ──────────────────
    // The sequence guarantees ordering and spacing. Sending more than one
    // channel here would reintroduce the simultaneous-message bug.
    const ch = channel
    const cartLink = await linkFor(ch, 'cart')
    const cartUrl = cartLink.url

    // ── Idempotency ────────────────────────────────────────────────────
    // One row per (cart, channel, step). A fresh 'pending' row belongs to a
    // concurrent worker; a sent/delivered/skipped row is terminal. A stale
    // pending row (>10 min) or a failed row is reused, so a retry sends once.
    const existingMessage: any = cart.messages.find((m: any) => m.channel === ch && m.step === step)
    if (
      existingMessage &&
      (existingMessage.status === 'sent' ||
        existingMessage.status === 'delivered' ||
        existingMessage.status === 'skipped')
    ) {
      return { sent: 0, failed: 0 }
    }
    const stalePending =
      existingMessage?.status === 'pending' &&
      Date.now() - new Date(existingMessage.createdAt).getTime() > 10 * 60 * 1000
    if (existingMessage?.status === 'pending' && !stalePending) {
      return { sent: 0, failed: 0 }
    }

    // Retry backoff: a failed message is not retried on every sweep. After the
    // attempt budget is spent it is marked skipped with an explainable reason.
    if (existingMessage?.status === 'failed') {
      const attempts = Number(existingMessage.attempts) || 0
      const engagementLimited =
        ch === 'whatsapp' && isEngagementLimitedReason(existingMessage.reasonCode)
      // Meta's per-user marketing limit needs a long pause, not the normal
      // five-minute retry. After two attempts the step is skipped; if email is
      // a later configured step it will be sent when its own delay elapses.
      if (engagementLimited && attempts >= 2) {
        await prisma.message
          .update({
            where: { id: existingMessage.id },
            data: { status: 'skipped', reasonCode: 'whatsapp_engagement_limited' },
          })
          .catch(() => {})
        return { sent: 0, failed: 0 }
      }
      if (attempts >= maxSendAttempts()) {
        await prisma.message
          .update({
            where: { id: existingMessage.id },
            data: { status: 'skipped', reasonCode: 'retry_exhausted' },
          })
          .catch(() => {})
        return { sent: 0, failed: 0 }
      }
      const lastAttempt = existingMessage.lastAttemptAt
        ? new Date(existingMessage.lastAttemptAt).getTime()
        : 0
      const retryDelay = engagementLimited ? 24 * 60 * 60 * 1000 : retryDelayMs(attempts)
      if (lastAttempt && Date.now() - lastAttempt < retryDelay) {
        return { sent: 0, failed: 0 }
      }
    }

    let sendSuccess = false
    let error = ''
    let providerId: string | undefined
    let messageId = ''
    let whatsappFailure: Parameters<typeof isPermanentWhatsAppFailure>[0] | null = null
    let failureReason: string | null = null
    let whatsappFreeFormBody: string | null = null
    let composed: any = null

    try {
      // ── Compose (validated) copy ────────────────────────────────────
      composed = await composeRecoveryMessage({
        storeId: store.id,
        storeName: store.name,
        currencySymbol,
        customerName: personalName,
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
        maxRounds,
        voice,
        previousMessage,
      })

      // ── Claim the step BEFORE sending ───────────────────────────────
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
            ? singleLineMessage(stripLeadingGreeting(composed.body, personalName))
            : composed.body,
        status: 'pending',
        sentAt: null,
        deliveredAt: null,
        variant: composed.variant,
        promptVersion: composed.promptVersion,
        providerId: null,
        attempts: (Number(existingMessage?.attempts) || 0) + 1,
        lastAttemptAt: new Date(),
        reasonCode: null,
      }
      try {
        if (existingMessage) {
          // Condition the claim on the status we just read so two overlapping
          // sweeps cannot both retry the same failed row. The loser re-reads
          // on its next pass instead of double-sending.
          const claimed = await prisma.message.updateMany({
            where: { id: existingMessage.id, status: existingMessage.status },
            data: { ...claim, createdAt: new Date() },
          })
          if (claimed.count === 0) return { sent: 0, failed: 0 }
          messageId = existingMessage.id
        } else {
          const created = await prisma.message.create({ data: claim })
          messageId = created.id
        }
      } catch (claimErr: any) {
        if (claimErr?.code === 'P2002') {
          // Another worker claimed this cart/channel/step first.
          return { sent: 0, failed: 0 }
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
          personalName || '',
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
            checkoutUrl: (await linkFor('email', 'checkout')).url,
            bargainUrl: (await linkFor('email', 'bargain')).url,
            headline: composed.headline,
            cta: composed.cta,
          },
        )
        const emailResult = await sendEmail({
          to: cart.customerEmail!,
          subject: composed.subject || `${personalName ? `${personalName}, ` : ''}your cart is still saved`,
          html: emailHtml,
          text: composed.body,
        })
        sendSuccess = emailResult.success
        providerId = emailResult.messageId
        if (!sendSuccess) {
          error = emailResult.error || 'Unknown error'
          failureReason = 'email_transient'
        }
      } else {
        const firstImage = getFirstProductImage(cartItems)
        console.log(
          `[recovery] cart=${cart.id} whatsapp header=${firstImage ? 'product-photo' : 'fallback-image'}`,
        )
        const templateMap = [
          WhatsAppTemplates.abandoned_cart,
          WhatsAppTemplates.abandoned_cart_followup,
          WhatsAppTemplates.abandoned_cart_urgent,
        ]

        // {{3}} is the offer line. It carries ONE short checkout link: the
        // template already has the Complete Purchase button, so a second
        // "Bargain now" URL only made the message longer and hid the CTA
        // behind "Read more".
        const offerValueLabel = authorisedDiscount
          ? authorisedDiscount.type === 'percentage'
            ? `${authorisedDiscount.value}% off`
            : authorisedDiscount.type === 'free_shipping'
              ? 'free shipping'
              : `${currencySymbol}${authorisedDiscount.value} off`
          : ''
        const checkoutLink = await linkFor('whatsapp', 'checkout')
        const productSummary = formatProductList(cartItems, 2)
        const firstItem = cartItems[0]
        const offerLine = buildRecoveryOfferLine({
          firstName,
          productSummary,
          productPrice: firstItem?.price || null,
          productQty: firstItem?.quantity || null,
          discountLabel: offerValueLabel,
          currencySymbol,
          code: authorisedDiscount?.code,
          checkoutUrl: checkoutLink.url,
        })

        const previousFailure = existingMessage?.status === 'failed'
          ? {
              errorCode: undefined,
              errorSubcode: undefined,
              error: existingMessage.reasonCode || undefined,
              errorDetails: undefined,
            }
          : null

        const decision = decideWhatsAppMessage({
          phone: whatsappPhone,
          identity: recipient,
          cartConverted: Boolean(cart.convertedAt || cart.isRecovered),
          storeActive: store.isActive !== false,
          whatsappConfigured: isWhatsAppConfigured(),
          onOptOutList: Boolean(cartPhoneDigits && optedOutPhones.has(cartPhoneDigits)),
          previousFailure,
          step: next.step.round,
          maxRounds: effMaxRounds,
        })

        if (decision.action.kind === 'skip') {
          // WhatsApp cannot send this step (consent, opt-out, 131049, permanent
          // or config failure). Mark it skipped so the sequence advances to the
          // next configured step on its own schedule — never simultaneously.
          await prisma.message
            .update({
              where: { id: messageId },
              data: { status: 'skipped', reasonCode: decision.reason },
            })
            .catch(() => {})
          console.warn(`[recovery] cart=${cart.id} whatsapp step ${step} skipped: ${decision.reason}`)
          return { sent: 0, failed: 0 }
        }

        let whatsappResult: Awaited<ReturnType<typeof sendWhatsAppMessage>>
        if (decision.action.kind === 'send_template') {
          const template = templateMap[Math.min(step, 2)]
          const headerImage = compactWhatsAppHeaderImage(
            firstImage ||
              process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL ||
              'https://cart-gain.com/logo.png',
          )
          const params = template.generateParams(
            firstName || 'there',
            singleLineMessage(stripLeadingGreeting(composed.body, personalName)),
            offerLine,
            headerImage,
            { buttonUrlSuffix: checkoutLink.code || undefined },
          )
          whatsappResult = await sendWhatsAppMessage({
            to: sanitizePhoneNumber(whatsappPhone!),
            templateName: decision.action.templateName || template.name,
            templateParams: params,
          })
        } else {
          // The customer messaged us in the last 24h. Meta allows free-form
          // text in that window and the per-user marketing-template limit
          // (131049) does not apply, so use the same copy + offer + links.
          whatsappFreeFormBody = [
            stripLeadingGreeting(composed.body, personalName).trim(),
            offerLine,
          ]
            .filter(Boolean)
            .join('\n\n')
          console.log(`[recovery] cart=${cart.id} whatsapp free-form (24h window)`)
          whatsappResult = await sendWhatsAppMessage({
            to: sanitizePhoneNumber(whatsappPhone!),
            content: whatsappFreeFormBody,
          })
        }
        sendSuccess = whatsappResult.success
        providerId = whatsappResult.messageId
        if (!sendSuccess) {
          error = whatsappResult.error || 'Unknown error'
          const failureShape = {
            errorCode: whatsappResult.errorCode,
            errorSubcode: whatsappResult.errorSubcode,
            error: whatsappResult.error,
            errorDetails: whatsappResult.errorDetails,
          }
          failureReason = isEngagementLimitedWhatsAppFailure(failureShape)
            ? 'whatsapp_engagement_limited'
            : isPermanentWhatsAppFailure(failureShape)
              ? 'whatsapp_permanent'
              : isConfigWhatsAppFailure(failureShape)
                ? 'whatsapp_config'
                : 'whatsapp_transient'
          whatsappFailure = failureShape
        }
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
          reasonCode: sendSuccess ? null : failureReason || 'send_failed',
          lastAttemptAt: new Date(),
          ...(whatsappFreeFormBody ? { content: whatsappFreeFormBody } : {}),
        },
      })
    } catch (err: any) {
      console.error(`Error sending ${ch} for cart ${cart.id}:`, err?.message || err)
      error = err.message
      failureReason = err?.code === 'TEMPLATE_PARAM_INVALID' ? 'template_invalid' : 'send_error'
      if (messageId) {
        await prisma.message
          .update({
            where: { id: messageId },
            data: {
              status: 'failed',
              reasonCode: failureReason,
              lastAttemptAt: new Date(),
              ...(whatsappFreeFormBody ? { content: whatsappFreeFormBody } : {}),
            },
          })
          .catch(() => {})
      }
    }

    if (!sendSuccess) {
      console.error(`Failed to send ${ch} message for cart ${cart.id}: ${error || 'unknown error'}`)
      // A permanently undeliverable WhatsApp step is marked skipped so the
      // sequence advances to the next configured step (e.g. a later email)
      // instead of retrying forever. Transient/config/engagement failures stay
      // `failed` and are retried with backoff.
      if (ch === 'whatsapp' && whatsappFailure && isPermanentWhatsAppFailure(whatsappFailure) && messageId) {
        await prisma.message
          .update({
            where: { id: messageId },
            data: { status: 'skipped', reasonCode: failureReason || 'whatsapp_permanent' },
          })
          .catch(() => {})
      }

      // A failed step stays retryable; no other channel is sent in this sweep.
      return { sent: 0, failed: 1 }
    }

    await markRecipientContacted({
      storeId: store.id,
      email: cart.customerEmail,
      phone: cart.customerPhone,
      channel: ch as 'email' | 'whatsapp',
    }).catch(() => {})
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

    return { sent: 1, failed: 0 }
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
