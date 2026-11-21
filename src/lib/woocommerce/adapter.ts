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
      if (Array.isArray(existing) && existing.some((entry) => text(record(entry)?.code) === coupon.code)) {
        return { code: coupon.code, status: 'existing', verified: true }
      }

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
      })

      const readback = await client.listCoupons(coupon.code)
      const verified = Array.isArray(readback) && readback.some((entry) => text(record(entry)?.code) === coupon.code)
      return { code: coupon.code, status: 'created', verified }
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
