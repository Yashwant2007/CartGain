/**
 * Recovery offers — resolve the discount a recovery message is allowed to
 * promise.
 */

import crypto from 'crypto'
import { createShopifyDiscountCode } from '@/lib/shopify/discount'
import { ConversationDiscount } from '@/lib/conversation/facts'

export type RecoveryOffer = ConversationDiscount & {
  source: 'campaign' | 'minted'
}

export type RecoveryCampaignConfig = {
  discountEnabled: boolean
  discountType?: string | null
  discountValue?: number | null
  discountCode?: string | null
}

type ShopifyStore = {
  id: string
  domain: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}

const MAX_PERCENT = 90
const CODE_TTL_DAYS = 7

export function buildRecoveryCode(cartId: string): string {
  const digest = crypto.createHash('sha256').update(cartId).digest('hex').toUpperCase()
  return `GAIN${digest.slice(0, 6)}`
}

function normalizeOffer(
  config: RecoveryCampaignConfig
): { value: number; type: 'percentage' | 'fixed' } | null {
  if (!config.discountEnabled) return null
  const raw = Number(config.discountValue)
  if (!Number.isFinite(raw) || raw <= 0) return null
  if (config.discountType === 'fixed') {
    return { value: Math.round(raw * 100) / 100, type: 'fixed' }
  }
  return { value: Math.min(MAX_PERCENT, Math.max(1, Math.round(raw))), type: 'percentage' }
}

async function createShopifyCode(opts: {
  store: ShopifyStore
  code: string
  value: number
  type: 'percentage' | 'fixed'
  minimumSubtotal?: number
}): Promise<boolean> {
  const now = new Date()
  const endsAt = new Date(now.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const result = await createShopifyDiscountCode({
    store: opts.store,
    code: opts.code,
    title: `Cart recovery ${opts.code}`,
    startsAt: now,
    endsAt,
    value:
      opts.type === 'percentage'
        ? { kind: 'percentage', percentage: opts.value }
        : { kind: 'fixed', amount: opts.value },
    target: { scope: 'order' },
    minimumSubtotal: opts.minimumSubtotal,
  })
  return result.status === 'created' && result.verified
}

export async function resolveRecoveryOffer(opts: {
  store: ShopifyStore
  cartId: string
  campaignConfig?: RecoveryCampaignConfig
  campaign?: RecoveryCampaignConfig
  cartValue?: number | null
  cartTotal?: number | null
}): Promise<RecoveryOffer | null> {
  const config = opts.campaignConfig || opts.campaign
  if (!config) return null
  const { store, cartId } = opts
  const cartValue = opts.cartValue ?? opts.cartTotal ?? null

  if (!config.discountEnabled) {
    return null
  }

  if (config.discountCode && config.discountCode.trim()) {
    const norm = normalizeOffer(config)
    if (!norm) return null
    return {
      code: config.discountCode.trim(),
      value: norm.value,
      type: norm.type,
      source: 'campaign',
    }
  }

  const norm = normalizeOffer(config)
  if (!norm) return null

  const code = buildRecoveryCode(cartId)
  const ok = await createShopifyCode({
    store,
    code,
    value: norm.value,
    type: norm.type,
    minimumSubtotal: cartValue ?? undefined,
  })

  if (!ok) {
    return null
  }

  return {
    code,
    value: norm.value,
    type: norm.type,
    source: 'minted',
  }
}
