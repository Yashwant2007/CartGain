import prisma from '@/lib/db'
import { normalizeShopDomain, shopDomainCandidates } from '@/lib/stores/resolve-by-domain'
import { bargainPlatformFor, resolveActiveWooCommerceStore } from '@/lib/woocommerce/bargain-adapter'

const CHECKOUT_ORIGINS = [
  'https://checkout.shopify.com',
  'https://cart-gain.com',
  /^https:\/\/[a-z0-9-]+\.myshopify\.com$/,
]

export function checkoutOriginCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && CHECKOUT_ORIGINS.some(
    (candidate) => candidate === origin || (candidate instanceof RegExp && candidate.test(origin)),
  )
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export function normalizeCheckoutCustomerId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(?:gid:\/\/shopify\/Customer\/)?(\d{1,20})$/)
  return match ? match[1] : null
}

export interface CheckoutBuyer {
  cartToken: string | null
  customerFingerprint: string | null
  customerEmail: string | null
  shopifyCustomerId: string | null
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max ? trimmed : null
}

export function checkoutBuyerFromBody(body: any): CheckoutBuyer {
  const email = bounded(body?.customerEmail, 254)
  return {
    cartToken: bounded(body?.cartToken ?? body?.checkoutToken, 512),
    customerFingerprint: bounded(body?.customerFingerprint, 256),
    customerEmail: email && email.includes('@') ? email : null,
    shopifyCustomerId: normalizeCheckoutCustomerId(body?.shopifyCustomerId),
  }
}

export async function resolveCheckoutStore(platform: string, body: any): Promise<any | null> {
  if (platform === 'woocommerce') {
    return resolveActiveWooCommerceStore({
      storeId: body?.storeId,
      domain: body?.domain ?? body?.storeDomain ?? body?.shopDomain,
    })
  }
  const domain = typeof body?.shopDomain === 'string' ? body.shopDomain : ''
  if (!domain) return null
  const cleanDomain = normalizeShopDomain(domain)
  const candidates = shopDomainCandidates(cleanDomain)
  const matches = await Promise.all(
    candidates.map((candidate) =>
      prisma.store.findFirst({
        where: {
          domain: { equals: candidate, mode: 'insensitive' },
          platform: 'shopify',
          apiKey: { not: null },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ),
  )
  return matches.find((store) => store !== null) ?? null
}

export function checkoutPlatform(body: any): string {
  return bargainPlatformFor(null, body?.platform ?? 'shopify')
}
