import type {
  PlatformAdapter,
  PlatformConnectionConfig,
  PlatformCouponInput,
  PlatformCouponResult,
  PlatformHealthResult,
  PlatformOrderRecord,
  PlatformProfile,
  PlatformVerifyResult,
} from '@/lib/platforms/types'
import { WooCommerceClient, WooCommerceClientError } from './client'
import { normalizeOrderEvent } from './normalize'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function profileFromSystemStatus(data: Record<string, unknown>): PlatformProfile {
  const site = record(data.site) ?? {}
  const settings = record(data.settings) ?? {}
  return {
    externalId: text(site.id) ?? text(data.store_id),
    name: text(site.title) ?? text(site.name),
    url: text(site.url) ?? text(data.site_url),
    currency: text(settings.currency_code) ?? text(data.currency),
    timezone: text(settings.timezone_string) ?? text(data.timezone),
    raw: data,
  }
}

function errorCode(error: unknown): string {
  return error instanceof WooCommerceClientError ? error.code : 'unexpected_error'
}

function couponIdValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value
    .map((entry) => {
      const raw = typeof entry === 'number' && Number.isFinite(entry) ? String(entry) : text(entry)
      if (!raw) return null
      const normalized = raw.replace(/^woo-/i, '')
      return normalized.match(/\d+/)?.[0] ?? null
    })
    .filter((entry): entry is string => Boolean(entry))
  return Array.from(new Set(ids)).sort()
}

function couponMatches(existing: unknown, coupon: PlatformCouponInput, now: number): boolean {
  const row = record(existing)
  if (!row) return false
  if ((text(row.status) ?? 'publish') !== 'publish') return false

  const expires = text(row.date_expires)
  if (expires) {
    const parsed = new Date(expires)
    if (Number.isFinite(parsed.getTime()) && parsed.getTime() <= now) return false
  }
  const expectedExpiry = coupon.expiresAt ? coupon.expiresAt.toISOString().slice(0, 10) : ''
  if ((expires?.slice(0, 10) ?? '') !== expectedExpiry) return false

  const usageLimit = Number(row.usage_limit ?? 0)
  const usageCount = Number(row.usage_count ?? 0)
  if (usageLimit > 0 && usageCount >= usageLimit) return false

  const expectedType = coupon.type === 'percentage' ? 'percent' : 'fixed_cart'
  if (text(row.discount_type) !== expectedType) return false
  if (Math.abs(Number(row.amount ?? -1) - Number(coupon.value)) > 0.001) return false

  const expectedMinimum = coupon.minimumSubtotal && coupon.minimumSubtotal > 0 ? coupon.minimumSubtotal.toFixed(2) : ''
  const actualMinimum = Number(row.minimum_amount ?? 0) > 0 ? Number(row.minimum_amount).toFixed(2) : ''
  if (actualMinimum !== expectedMinimum) return false

  const expectedIds = couponIdValues(coupon.productIds)
  if (JSON.stringify(couponIdValues(row.product_ids)) !== JSON.stringify(expectedIds)) return false
  return true
}

export const wooCommerceAdapter: PlatformAdapter = {
  id: 'woocommerce',

  async verifyConnection(input: PlatformConnectionConfig): Promise<PlatformVerifyResult> {
    try {
      const client = new WooCommerceClient(input)
      const data = await client.systemStatus()
      return { verified: true, profile: profileFromSystemStatus(data) }
    } catch (error) {
      if (!errorCode(error).startsWith('not_found')) {
        return { verified: false, errorCode: errorCode(error) }
      }
      try {
        const client = new WooCommerceClient(input)
        const products = await client.listProducts({ perPage: 1 })
        return {
          verified: true,
          profile: {
            url: input.storeUrl,
            raw: { verificationFallback: 'products', productCount: Array.isArray(products) ? products.length : 0 },
          },
        }
      } catch (fallbackError) {
        return { verified: false, errorCode: errorCode(fallbackError) }
      }
    }
  },

  async fetchStoreProfile(input: PlatformConnectionConfig): Promise<PlatformProfile> {
    const client = new WooCommerceClient(input)
    return profileFromSystemStatus(await client.systemStatus())
  },

  async listProducts(input: PlatformConnectionConfig, options): Promise<unknown[]> {
    const client = new WooCommerceClient(input)
    return client.listProducts(options)
  },

  async fetchProduct(input: PlatformConnectionConfig, productId: string): Promise<unknown> {
    const client = new WooCommerceClient(input)
    return client.fetchProduct(productId)
  },

  async listOrders(input: PlatformConnectionConfig, options): Promise<unknown[]> {
    const client = new WooCommerceClient(input)
    return client.listOrders(options)
  },

  async createCoupon(input: PlatformConnectionConfig, coupon: PlatformCouponInput): Promise<PlatformCouponResult> {
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(coupon.code)) {
      return { code: coupon.code, status: 'failed', verified: false, errorCode: 'invalid_code' }
    }
    const value = Number(coupon.value)
    if (!Number.isFinite(value) || value <= 0 || (coupon.type === 'percentage' && value > 100)) {
      return { code: coupon.code, status: 'failed', verified: false, errorCode: 'invalid_value' }
    }

    try {
      const client = new WooCommerceClient(input)
      const existing = await client.listCoupons(coupon.code)
      const now = Date.now()
      if (Array.isArray(existing)) {
        const match = existing.find((entry) => text(record(entry)?.code) === coupon.code)
        if (match) {
          if (!couponMatches(match, coupon, now)) {
            return { code: coupon.code, status: 'failed', verified: false, errorCode: 'coupon_unusable' }
          }
          return { code: coupon.code, status: 'existing', verified: true }
        }
      }

      const productIds = couponIdValues(coupon.productIds).map((id) => Number(id)).filter((id) => Number.isInteger(id))
      await client.createCoupon({
        code: coupon.code,
        discount_type: coupon.type === 'percentage' ? 'percent' : 'fixed_cart',
        amount: coupon.type === 'percentage' ? String(value) : value.toFixed(2),
        description: coupon.description || 'CartGain recovery offer',
        ...(coupon.expiresAt ? { date_expires: coupon.expiresAt.toISOString() } : {}),
        ...(coupon.usageLimit ? { usage_limit: coupon.usageLimit } : {}),
        ...(coupon.minimumSubtotal && coupon.minimumSubtotal > 0
          ? { minimum_amount: coupon.minimumSubtotal.toFixed(2) }
          : {}),
        ...(productIds.length > 0 ? { product_ids: productIds } : {}),
      })

      const readback = await client.listCoupons(coupon.code)
      const created = Array.isArray(readback)
        ? readback.find((entry) => text(record(entry)?.code) === coupon.code)
        : null
      if (!created || !couponMatches(created, coupon, now)) {
        return { code: coupon.code, status: 'failed', verified: false, errorCode: 'coupon_verification_failed' }
      }
      return { code: coupon.code, status: 'created', verified: true }
    } catch (error) {
      return { code: coupon.code, status: 'failed', verified: false, errorCode: errorCode(error) }
    }
  },

  async revokeCoupon(input: PlatformConnectionConfig, code: string): Promise<boolean> {
    try {
      const client = new WooCommerceClient(input)
      const coupons = await client.listCoupons(code)
      const match = coupons.find((entry) => text(record(entry)?.code) === code)
      const id = text(record(match)?.id)
      if (!id) return false
      await client.deleteCoupon(id)
      return true
    } catch {
      return false
    }
  },

  async verifyOrder(input: PlatformConnectionConfig, orderId: string): Promise<PlatformOrderRecord | null> {
    try {
      const client = new WooCommerceClient(input)
      const raw = await client.fetchOrder(orderId)
      return normalizeOrderEvent(raw)
    } catch {
      return null
    }
  },

  async healthCheck(input: PlatformConnectionConfig): Promise<PlatformHealthResult> {
    const checkedAt = new Date()
    if (!input.webhookSecret) {
      return {
        ok: false,
        status: 'unreachable',
        checks: { plugin: 'unavailable', webhook: 'unavailable' },
        checkedAt,
        errorCode: 'missing_webhook_secret',
      }
    }
    try {
      const client = new WooCommerceClient(input)
      const data = await client.pluginHealth()
      const pluginHealthy = record(data)?.ok === true || text(record(data)?.status) === 'ok'
      return {
        ok: pluginHealthy,
        status: pluginHealthy ? 'ok' : 'degraded',
        checks: {
          credentials: 'ok',
          plugin: pluginHealthy ? 'ok' : 'unavailable',
          webhook: record(data)?.webhook === true ? 'ok' : 'unknown',
        },
        checkedAt,
      }
    } catch (error) {
      return {
        ok: false,
        status: 'unreachable',
        checks: { plugin: 'unavailable', webhook: 'unavailable' },
        checkedAt,
        errorCode: errorCode(error),
      }
    }
  },
}
