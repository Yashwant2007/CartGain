import prisma from '@/lib/db'
import { normalizeShopDomain } from '@/lib/stores/resolve-by-domain'
import { WooCommerceClient } from '@/lib/woocommerce/client'
import { createWooCouponForStore, getWooConnectionBundle } from '@/lib/woocommerce/service'
import {
  normalizeProduct,
  sanitizeMerchantFaq,
  type ProductContext,
  type ShopifyProductSource,
  type ShopifyVariantSource,
} from '@/lib/bargain/product-context'

export type BargainPlatform = 'shopify' | 'woocommerce'

const WOOCOMMERCE = 'woocommerce'

export function isWooCommerce(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === WOOCOMMERCE
}

export function bargainPlatformFor(store: any, requested?: unknown): BargainPlatform {
  if (isWooCommerce(requested) || isWooCommerce(store?.platform)) return WOOCOMMERCE
  return 'shopify'
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function boolOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (['true', 'yes', '1', 'publish', 'published', 'active', 'instock', 'in_stock', 'available'].includes(v)) return true
    if (['false', 'no', '0', 'draft', 'pending', 'outofstock', 'out_of_stock', 'unavailable'].includes(v)) return false
  }
  return null
}

function pick(record: any, keys: string[]): unknown {
  if (!record || typeof record !== 'object') return undefined
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function nested(record: any): any {
  return pick(record, ['data', 'payload', 'raw', 'metadata', 'attributes']) ?? {}
}

export function productField(row: any, keys: string[]): unknown {
  const direct = pick(row, keys)
  if (direct !== undefined) return direct
  return pick(nested(row), keys)
}

export async function hasActiveWooCommerceConnection(store: any): Promise<boolean> {
  if (!store?.id || store?.isActive === false || !isWooCommerce(store.platform)) return false
  try {
    return Boolean(await getWooConnectionBundle(store.id))
  } catch {
    return false
  }
}

export async function resolveActiveWooCommerceStore(input: {
  storeId?: unknown
  domain?: unknown
  shopDomain?: unknown
  storeDomain?: unknown
}): Promise<any | null> {
  const storeId = text(input.storeId)
  const domainRaw = text(input.domain) ?? text(input.shopDomain) ?? text(input.storeDomain)
  const domain = domainRaw ? normalizeShopDomain(domainRaw) : null
  if (!storeId && !domain) return null

  let candidates: any[] = []
  try {
    if (storeId) {
      const found = await prisma.store.findUnique({ where: { id: storeId } })
      if (found) candidates.push(found)
    }
    if (domain && !storeId) {
      const found = await prisma.store.findFirst({
        where: {
          platform: WOOCOMMERCE,
          isActive: true,
          domain: { equals: domain, mode: 'insensitive' },
        },
      })
      if (found) candidates.push(found)
    }
  } catch {
    return null
  }

  for (const store of candidates) {
    if (await hasActiveWooCommerceConnection(store)) return store
  }
  return null
}

async function findRows(delegate: any, args: any, fallbackArgs: any): Promise<any[]> {
  if (!delegate?.findMany) return []
  try {
    const rows = await delegate.findMany(args)
    if (Array.isArray(rows)) return rows
  } catch {
    return []
  }
  try {
    const rows = await delegate.findMany(fallbackArgs)
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function matchesId(row: any, id: string): boolean {
  const values = [
    pick(row, ['platformProductId', 'externalProductId', 'productId', 'wcProductId']),
    pick(nested(row), ['platformProductId', 'externalProductId', 'productId', 'id']),
    row?.id,
  ]
  return values.some((value) => text(value) === id)
}

export async function findPlatformProduct(storeId: string, productId: string): Promise<any | null> {
  const rows = await findRows(
    (prisma as any).platformProduct,
    { where: { storeId, platform: WOOCOMMERCE, platformProductId: productId }, take: 2 },
    { where: { storeId }, take: 200 },
  )
  return rows.find((row) => {
    const platform = pick(row, ['platform', 'provider', 'type'])
    return (!platform || isWooCommerce(platform)) && matchesId(row, productId)
  }) ?? null
}

export async function findBargainProductOverride(
  storeId: string,
  productId: string,
  platform?: unknown,
): Promise<any | null> {
  const delegate = (prisma as any).bargainProduct
  if (!delegate) return null
  if (!isWooCommerce(platform)) {
    try {
      return await delegate.findUnique({
        where: { storeId_shopifyProductId: { storeId, shopifyProductId: productId } },
      })
    } catch {
      return null
    }
  }
  let byPlatform: any = null
  try {
    byPlatform = await delegate.findFirst({ where: { storeId, platformProductId: productId } })
  } catch {
    byPlatform = null
  }
  if (byPlatform) return byPlatform
  try {
    return await delegate.findUnique({
      where: { storeId_shopifyProductId: { storeId, shopifyProductId: productId } },
    })
  } catch {
    return null
  }
}

export async function listPlatformProducts(storeId: string): Promise<any[]> {
  const rows = await findRows(
    (prisma as any).platformProduct,
    { where: { storeId, platform: WOOCOMMERCE }, orderBy: { createdAt: 'desc' } },
    { where: { storeId } },
  )
  return rows.filter((row) => {
    const platform = pick(row, ['platform', 'provider', 'type'])
    return !platform || isWooCommerce(platform)
  })
}

export function platformProductId(row: any): string | null {
  return text(pick(row, ['platformProductId', 'externalProductId', 'productId', 'wcProductId']) ?? row?.id)
}

export function platformProductPrice(row: any): number | null {
  return numberOrNull(productField(row, ['salePrice', 'sale_price', 'price', 'regularPrice', 'regular_price', 'displayPrice']))
}

export function platformProductVariantId(row: any, requested?: unknown): string | null {
  return text(requested) ?? text(productField(row, ['variantId', 'platformVariantId', 'defaultVariantId', 'id']))
}

export function storeBaseUrl(store: any): string {
  const domain = text(store?.domain) ?? 'localhost'
  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
}

export function wooProductUrl(row: any, store: any, productId: string): string {
  const base = storeBaseUrl(store)
  const permalink = text(productField(row, ['permalink', 'link', 'url']))
  if (permalink) {
    try {
      const candidate = new URL(permalink, base)
      if (candidate.protocol === 'https:' && candidate.origin === new URL(base).origin) {
        return candidate.toString()
      }
    } catch {}
  }
  const slug = text(productField(row, ['slug', 'handle']))
  if (slug && !/^\d+$/.test(slug)) {
    return `${base}/product/${encodeURIComponent(slug)}`
  }
  return `${base}/?product_id=${encodeURIComponent(productId)}`
}

function productSource(row: any, store: any, productId: string, variantId?: string | null): ShopifyProductSource {
  const attrs = nested(row)
  const status = text(productField(row, ['status', 'state', 'visibility'])) ?? 'active'
  const stockStatus = text(productField(row, ['stockStatus', 'stock_status', 'availability']))
  const regular = numberOrNull(productField(row, ['regularPrice', 'regular_price', 'compareAtPrice', 'compare_at_price']))
  const sale = numberOrNull(productField(row, ['salePrice', 'sale_price', 'price']))
  const price = platformProductPrice(row) ?? sale ?? regular ?? 0
  const image = productField(row, ['imageUrl', 'image', 'featuredImage'])
  const images = productField(row, ['images'])
  const imageSrc =
    text(pick(image as any, ['src', 'url'])) ??
    text((Array.isArray(images) ? images[0] : null) as any) ??
    text(pick(Array.isArray(images) ? images[0] : null, ['src', 'url'])) ??
    null
  const handle = text(productField(row, ['handle', 'slug'])) ?? productId
  const variantRows = productField(row, ['variants'])
  const variants: ShopifyVariantSource[] = Array.isArray(variantRows) && variantRows.length > 0
    ? variantRows.map((v: any) => ({
        id: text(pick(v, ['id', 'variantId', 'platformVariantId', 'externalVariantId'])) ?? productId,
        title: text(pick(v, ['title', 'name'])) ?? 'Default',
        price: numberOrNull(pick(v, ['price', 'salePrice', 'amount'])) ?? price,
        compare_at_price: numberOrNull(pick(v, ['compareAtPrice', 'regularPrice', 'compare_at_price'])) ?? regular,
        available: boolOrNull(pick(v, ['available', 'inStock', 'isAvailable', 'purchasable'])) ?? boolOrNull(stockStatus),
        inventory_quantity: numberOrNull(pick(v, ['inventoryQuantity', 'stockQuantity', 'inventory_quantity'])),
      }))
    : [{
        id: variantId ?? productId,
        title: 'Default',
        price,
        compare_at_price: regular,
        available:
          boolOrNull(productField(row, ['available', 'inStock', 'isAvailable', 'purchasable'])) ??
          boolOrNull(stockStatus) ??
          (status === 'active' || status === 'publish' || status === 'published' ? true : null),
        inventory_quantity: numberOrNull(productField(row, ['inventoryQuantity', 'stockQuantity'])),
      }]

  return {
    id: productId,
    title: text(productField(row, ['title', 'name'])) ?? 'this product',
    handle,
    vendor: text(productField(row, ['vendor', 'brand'])),
    product_type: text(productField(row, ['productType', 'product_type', 'type'])),
    tags: text(productField(row, ['tags'])) ?? (Array.isArray(attrs.tags) ? attrs.tags.join(',') : undefined),
    status,
    body_plain: text(productField(row, ['description', 'bodyPlain', 'shortDescription'])),
    body_html: text(productField(row, ['bodyHtml', 'descriptionHtml'])),
    image: imageSrc ? { src: imageSrc } : null,
    variants,
  }
}

export async function buildWooCommerceProductContext(opts: {
  store: any
  storeId: string
  productId: string
  variantId?: string | null
  currency: string
  baseUrl?: string | null
  fallbackTitle?: string | null
}): Promise<ProductContext> {
  const row = await findPlatformProduct(opts.storeId, opts.productId)
  if (!row) {
    const source: ShopifyProductSource = {
      id: opts.productId,
      title: opts.fallbackTitle ?? 'this product',
      variants: [],
    }
    return normalizeProduct(source, {
      currency: opts.currency,
      overrides: {},
      promotions: [],
      fetchFailed: true,
    })
  }

  const override = await findBargainProductOverride(opts.storeId, opts.productId, WOOCOMMERCE)
  const config = await prisma.bargainConfig.findUnique({
    where: { storeId: opts.storeId },
    select: {
      approvedSellingPoints: true,
      disallowedClaims: true,
      merchantFaq: true,
      campaignName: true,
      campaignMessage: true,
      campaignStart: true,
      campaignEnd: true,
    },
  })
  const disallowedClaims = Array.from(new Set([
    ...(Array.isArray(config?.disallowedClaims) ? config!.disallowedClaims : []),
    ...(Array.isArray(override?.disallowedClaims) ? override!.disallowedClaims : []),
  ]))
  const approvedSellingPoints = Array.from(new Set([
    ...(Array.isArray(config?.approvedSellingPoints) ? config!.approvedSellingPoints : []),
    ...(Array.isArray(override?.approvedSellingPoints) ? override!.approvedSellingPoints : []),
  ]))
  const now = new Date()
  const campaignActive = config?.campaignName
    ? (config.campaignStart == null || config.campaignStart.getTime() <= now.getTime()) &&
      (config.campaignEnd == null || config.campaignEnd.getTime() >= now.getTime())
    : false

  const ctx = normalizeProduct(productSource(row, opts.store, opts.productId, opts.variantId), {
    currency: opts.currency,
    variantId: opts.variantId,
    overrides: {
      approvedSellingPoints,
      disallowedClaims,
      merchantFaq: sanitizeMerchantFaq(config?.merchantFaq, disallowedClaims),
    },
    promotions: config?.campaignName
      ? [{
          name: config.campaignName,
          message: config.campaignMessage ?? null,
          source: 'CARTGAIN_DERIVED',
          active: campaignActive,
        }]
      : [],
    now,
    baseUrl: opts.baseUrl ?? storeBaseUrl(opts.store),
    productUrl: wooProductUrl(row, opts.store, opts.productId),
  })
  return { ...ctx, descriptionSource: 'MERCHANT_PROVIDED' }
}

export type WooCommerceProductFacts = {
  price: number
  compareAtPrice: number | null
  available: boolean | null
  status: string | null
  title: string | null
  variantId: string | null
}

export async function getWooCommerceCredentials(store: any): Promise<{ baseUrl: string; key: string; secret: string } | null> {
  if (!store?.id) return null
  try {
    const bundle = await getWooConnectionBundle(store.id)
    if (!bundle) return null
    return {
      baseUrl: bundle.config.storeUrl,
      key: bundle.config.credentials.key,
      secret: bundle.config.credentials.secret,
    }
  } catch {
    return null
  }
}

export async function getWooCommerceProductFacts(opts: {
  store: any
  productId: string
  variantId?: string | null
  fallbackPrice?: number | null
}): Promise<WooCommerceProductFacts | null> {
  const row = await findPlatformProduct(opts.store.id, opts.productId)
  let live: any = null
  try {
    const bundle = await getWooConnectionBundle(opts.store.id)
    if (bundle) live = await new WooCommerceClient(bundle.config).fetchProduct(String(opts.productId))
  } catch {
    live = null
  }
  const source = live && typeof live === 'object' ? live : row
  if (!source) return null
  const regular = numberOrNull(pick(source, ['regular_price', 'regularPrice', 'compareAtPrice'])) ??
    numberOrNull(productField(row, ['regularPrice', 'compareAtPrice']))
  const price =
    numberOrNull(pick(source, ['price', 'sale_price', 'salePrice'])) ??
    (row ? platformProductPrice(row) : null) ??
    opts.fallbackPrice ??
    null
  if (price == null) return null
  const status = text(pick(source, ['status'])) ?? text(productField(row, ['status'])) ?? null
  const available =
    boolOrNull(pick(source, ['purchasable', 'is_purchasable', 'in_stock'])) ??
    boolOrNull(pick(source, ['stock_status'])) ??
    (status ? ['publish', 'published', 'active'].includes(status.toLowerCase()) : null)
  return {
    price,
    compareAtPrice: regular != null && regular > price ? regular : null,
    available,
    status,
    title: text(pick(source, ['name', 'title'])) ?? (row ? text(productField(row, ['title', 'name'])) : null),
    variantId: platformProductVariantId(row ?? source, opts.variantId),
  }
}

export function buildWooCommerceCheckoutUrl(opts: {
  domain: string
  code: string
  productId?: string | null
  variantId?: string | null
}): string {
  const domain = text(opts.domain)?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? ''
  const url = new URL(`https://${domain}/cart/`)
  url.searchParams.set('coupon_code', opts.code)
  const rawId = opts.variantId || opts.productId
  const productId = rawId ? String(rawId).replace(/^woo-/, '').match(/\d+/)?.[0] : null
  if (productId) url.searchParams.set('product_id', productId)
  return url.toString()
}

export async function createOrReuseWooCommerceCoupon(opts: {
  store: any
  code: string
  value: number
  type: 'percentage' | 'fixed'
  minimumSubtotal?: number | null
  productIds?: string[]
  expiresAt?: Date | null
  description?: string | null
}): Promise<{ code: string; status: 'created' | 'reused'; purchaseUrl: string } | null> {
  try {
    const result = await createWooCouponForStore(opts.store.id, {
      code: opts.code,
      type: opts.type,
      value: opts.value,
      expiresAt: opts.expiresAt ?? null,
      usageLimit: 1,
      minimumSubtotal: opts.minimumSubtotal ?? null,
      description: opts.description ?? `CartGain ${opts.code}`,
    })
    if (!result.verified || (result.status !== 'created' && result.status !== 'existing')) return null
    return {
      code: result.code,
      status: result.status === 'existing' ? 'reused' : 'created',
      purchaseUrl: buildWooCommerceCheckoutUrl({
        domain: opts.store.domain,
        code: result.code,
        productId: opts.productIds?.[0] ?? null,
      }),
    }
  } catch {
    return null
  }
}
