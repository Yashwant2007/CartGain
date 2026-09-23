// AI Salesperson — server-side assembly of ProductContext.
// Thin glue between the pure product-context core and the real Shopify/
// Prisma/Redis plumbing: fetch the catalog record, merge merchant overrides
// (per-product + per-store), attach truthful active promotions, cache briefly.
import prisma from '@/lib/db'
import { fetchShopifyProductDetail } from '@/lib/shopify'
import {
  normalizeProduct,
  getCachedProductContext,
  setCachedProductContext,
  isContextStale,
  type ProductContext,
  type ProductPromotion,
  type MerchantProductOverrides,
  type ShopifyProductSource,
} from '@/lib/bargain/product-context'

const CACHE_ENABLED = true

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const clean = item.trim()
    if (!clean || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())
    out.push(clean)
  }
  return out
}

async function loadOverrides(storeId: string, shopifyProductId: string): Promise<MerchantProductOverrides> {
  const [configRow, productRow] = await Promise.all([
    prisma.bargainConfig.findUnique({
      where: { storeId },
      select: { approvedSellingPoints: true, disallowedClaims: true },
    }),
    prisma.bargainProduct.findUnique({
      where: { storeId_shopifyProductId: { storeId, shopifyProductId } },
      select: { approvedSellingPoints: true, disallowedClaims: true },
    }),
  ])
  return {
    approvedSellingPoints: dedupe([
      ...(configRow?.approvedSellingPoints ?? []),
      ...(productRow?.approvedSellingPoints ?? []),
    ]),
    disallowedClaims: dedupe([
      ...(configRow?.disallowedClaims ?? []),
      ...(productRow?.disallowedClaims ?? []),
    ]),
  }
}

async function loadActivePromotions(storeId: string, now: Date): Promise<ProductPromotion[]> {
  const config = await prisma.bargainConfig.findUnique({
    where: { storeId },
    select: { campaignName: true, campaignMessage: true, campaignStart: true, campaignEnd: true },
  })
  if (!config?.campaignName) return []
  const active =
    (config.campaignStart == null || config.campaignStart.getTime() <= now.getTime()) &&
    (config.campaignEnd == null || config.campaignEnd.getTime() >= now.getTime())
  return [
    {
      name: config.campaignName,
      message: config.campaignMessage ?? null,
      source: 'CARTGAIN_DERIVED',
      active,
    },
  ]
}

function failedContext(
  shopifyProductId: string,
  fallbackTitle: string | null,
): ProductContext {
  const source: ShopifyProductSource = {
    id: shopifyProductId,
    title: fallbackTitle ?? 'this product',
    variants: [],
  }
  return normalizeProduct(source, {
    currency: 'INR',
    overrides: {},
    promotions: [],
    fetchFailed: true,
  })
}

export interface ProductContextOptions {
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null }
  storeId: string
  shopifyProductId: string
  variantId?: string | null
  currency: string
  baseUrl?: string | null
  fallbackTitle?: string | null
  useCache?: boolean
}

export async function buildProductContext(opts: ProductContextOptions): Promise<ProductContext> {
  const now = new Date()
  const overrides = await loadOverrides(opts.storeId, opts.shopifyProductId)

  if (CACHE_ENABLED && opts.useCache !== false) {
    const cached = await getCachedProductContext(opts.storeId, opts.shopifyProductId)
    if (cached && !isContextStale(cached)) return cached
  }

  const source = await fetchShopifyProductDetail(opts.store, opts.shopifyProductId)
  if (!source) {
    return failedContext(opts.shopifyProductId, opts.fallbackTitle ?? null)
  }

  const promotions = await loadActivePromotions(opts.storeId, now)
  const ctx = normalizeProduct(source, {
    currency: opts.currency,
    variantId: opts.variantId,
    overrides,
    promotions,
    now,
    baseUrl: opts.baseUrl ?? null,
  })

  if (CACHE_ENABLED && opts.useCache !== false) {
    await setCachedProductContext(ctx, opts.storeId)
  }
  return ctx
}