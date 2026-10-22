/**
 * Recovery offers — resolve the discount a recovery message is allowed to
 * promise.
 *
 * The old code asked the model for a "personalised code" and pasted it into
 * the message. That code was never created in the store, so the shopper was
 * sent to a checkout that rejected it — the single most expensive bug in the
 * recovery funnel (it looks like an offer, then fails at payment).
 *
 * Now the offer is resolved BEFORE any copy is written, from merchant
 * configuration only:
 *
 *   1. campaign.discountEnabled = false            → no offer, no code, no line
 *   2. campaign.discountCode set                   → the merchant's own code
 *   3. enabled, no code                            → mint a real single-use
 *                                                    Shopify code for this cart
 *                                                    (deterministic, so a retry
 *                                                    reuses it)
 *
 * If Shopify cannot create the code we return null: the message is then sent
 * WITHOUT an offer. Truthful beats "luring".
 */
import crypto from 'crypto'
import { getAccessToken } from '@/lib/shopify'
import { queryShopifyGraphQL } from '@/lib/shopify-graphql'
import { ConversationDiscount } from '@/lib/conversation/facts'

export type RecoveryOffer = ConversationDiscount & {
  /** 'campaign' = merchant-created code, 'minted' = created by us for this cart. */
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

/**
 * Stable per-cart code. Same cart → same code, so a retried job (or a second
 * channel) never mints a second discount for the same shopper.
 */
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

/**
 * Create the code in Shopify. Returns false when the store is not connected or
 * Shopify rejected it, so the caller sends no offer instead of a fake one.
 */
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
        codeDiscount { ... on DiscountCodeBasic { codes(first: 1) { edges { node { code } } } } }
        userErrors { field message code }
      }
    }
  `

  const variables = {
    basicCodeDiscount: {
      title: `Cart recovery ${opts.code}`,
      code: opts.code,
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      value:
        opts.type === 'percentage'
          ? { percentage: opts.value }
          : { discountAmount: { amount: opts.value, appliesOnEachItem: false } },
      ...(opts.minimumSubtotal && opts.minimumSubtotal > 0
        ? { minimumSubtotal: Math.round(opts.minimumSubtotal * 100) / 100 }
        : {}),
      summary:
        opts.type === 'percentage'
          ? `Cart recovery offer: ${opts.value}% off`
          : `Cart recovery offer: ${opts.value} off`,
    },
  }

  try {
    const data = await queryShopifyGraphQL<any>(shop, token, mutation, variables)
    const errors: Array<{ message?: string; code?: string }> =
      data?.discountCodeBasicCreate?.userErrors ?? []
    if (errors.length === 0) return true
    // A retry (or a concurrent worker) may have created the deterministic code
    // already — that is success, not failure.
    return errors.every((e) => `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase().includes('already'))
  } catch {
    return false
  }
}

/**
 * Resolve the offer for one cart. `null` means: send no offer at all.
 */
export async function resolveRecoveryOffer(opts: {
  campaign: RecoveryCampaignConfig
  store: ShopifyStore
  cartId: string
  cartTotal: number
}): Promise<RecoveryOffer | null> {
  const normalized = normalizeOffer(opts.campaign)
  if (!normalized) return null

  const merchantCode = (opts.campaign.discountCode || '').trim()
  if (merchantCode) {
    return { code: merchantCode, value: normalized.value, type: normalized.type, source: 'campaign' }
  }

  const code = buildRecoveryCode(opts.cartId)
  const created = await createShopifyCode({
    store: opts.store,
    code,
    value: normalized.value,
    type: normalized.type,
    minimumSubtotal: opts.cartTotal,
  })
  if (!created) return null

  return { code, value: normalized.value, type: normalized.type, source: 'minted' }
}
