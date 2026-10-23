/**
 * Recovery offers — resolve the discount a recovery message is allowed to
 * promise.
 */

import crypto from 'crypto'
import { getAccessToken } from '@/lib/shopify'
import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
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
  const shop = opts.store.domain.includes('.')
    ? opts.store.domain
    : `${opts.store.domain}.myshopify.com`

  let token: string | null = null
  try {
    token = await getAccessToken(opts.store)
  } catch {
    return false
  }
  if (!token) return false

  const now = new Date()
  const endsAt = new Date(now.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const mutation = `
    mutation recoveryDiscountCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes { code }
              }
            }
          }
        }
        userErrors { field message code }
      }
    }
  `

  const variables: any = {
    basicCodeDiscount: {
      title: `Cart recovery ${opts.code}`,
      code: opts.code,
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: false },
      customerGets: {
        items: { all: true },
        value:
          opts.type === 'percentage'
            ? { percentage: opts.value }
            : { discountAmount: { amount: Number(opts.value), appliesOnEachItem: false } },
      },
      summary:
        opts.type === 'percentage'
          ? `Cart recovery offer: ${opts.value}% off`
          : `Cart recovery offer: ${opts.value} off`,
    },
  }

  if (opts.minimumSubtotal && opts.minimumSubtotal > 0) {
    variables.basicCodeDiscount.minimumSubtotal = Math.round(opts.minimumSubtotal * 100) / 100
  }

  try {
    const data = await queryShopifyGraphQL<any>(shop, token, mutation, variables)
    const errors: Array<{ message?: string; code?: string }> =
      data?.discountCodeBasicCreate?.userErrors ?? []
    if (errors.length === 0) return true
    return errors.every((e) => `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase().includes('already'))
  } catch {
    return false
  }
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
