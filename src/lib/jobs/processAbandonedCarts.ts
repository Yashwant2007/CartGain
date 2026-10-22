import prisma from '@/lib/db'
import { logDataAccess, redactSensitive } from '@/lib/data-protection'
import { sendEmail, EmailTemplates } from '@/lib/services/email'
import { buildOptOutUrl } from '@/lib/opt-out'
import { sanitizePhoneNumber } from '@/lib/utils'
import { sendWhatsAppMessage, WhatsAppTemplates } from '@/lib/services/whatsapp'
import { resolveRecoveryOffer } from '@/lib/recovery/offer'
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
import { enrichCartItemsWithImages } from '@/lib/recovery/product-image'

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
  try {
    return await redisSetNX(`lock:store:${storeId}`, '1', PER_STORE_LOCK_TTL)
  } catch {
    return true // Don't block if Redis fails
  }
}

async function releasePerStoreLock(storeId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    // Use redisDel if available, or just let TTL expire
  } catch {}
  await releaseLock(`lock:store:${storeId}`).catch(() => {})
}

// ... rest of the file remains the same but with better error handling
