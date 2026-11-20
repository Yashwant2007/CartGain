import type {
  PlatformConnectionConfig,
  PlatformCredentials,
  PlatformListOptions,
} from '@/lib/platforms/types'
import { assertPublicHttpsUrl, type DnsLookup } from './url'
import { signPluginRequest } from './signature'

export type WooCommerceClientOptions = {
  timeoutMs?: number
  maxRetries?: number
  retryDelayMs?: number
  lookup?: DnsLookup
  fetchImpl?: typeof fetch
}

export class WooCommerceClientError extends Error {
  readonly status: number | null
  readonly code: string

  constructor(message: string, status: number | null, code: string) {
    super(message)
    this.name = 'WooCommerceClientError'
    this.status = status
    this.code = code
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT'
  path: string
  query?: Record<string, string | number | undefined | null>
  body?: Record<string, unknown>
  signed?: boolean
  label?: string
}

const WC_PREFIX = '/wp-json/wc/v3'
const PLUGIN_PREFIX = '/wp-json/cartgain/v1'

function safeStatus(status: number): number {
  return status >= 100 && status < 600 ? status : 0
}

function retryDelay(response: Response | null, fallback: number): number {
  const header = response?.headers.get('retry-after')
  if (!header) return fallback
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.min(5000, Math.max(100, seconds * 1000))
  const at = Date.parse(header)
  if (Number.isFinite(at)) return Math.min(5000, Math.max(100, at - Date.now()))
  return fallback
}

export class WooCommerceClient {
  private readonly baseUrl: string
  private readonly credentials: PlatformCredentials
  private readonly storeId: string
  private readonly webhookSecret: string | null
  private readonly options: Required<Pick<WooCommerceClientOptions, 'timeoutMs' | 'maxRetries' | 'retryDelayMs'>> &
    WooCommerceClientOptions

  constructor(config: PlatformConnectionConfig, options: WooCommerceClientOptions = {}) {
    this.baseUrl = config.storeUrl.replace(/\/+$/, '')
    this.credentials = config.credentials
    this.storeId = config.storeId
    this.webhookSecret = config.webhookSecret ?? null
    this.options = {
      timeoutMs: options.timeoutMs ?? 10_000,
      maxRetries: options.maxRetries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 400,
      ...options,
    }
  }

  private async fetchJson<T>(request: RequestOptions): Promise<T> {
    const label = request.label || 'request'
    await assertPublicHttpsUrl(this.baseUrl, this.options.lookup)

    const path = request.path.startsWith('/') ? request.path : `/${request.path}`
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'CartGain-WooCommerce-Connector/1.0',
    }
    if (request.body) headers['Content-Type'] = 'application/json'

    const basic = Buffer.from(`${this.credentials.key}:${this.credentials.secret}`).toString('base64')
    headers.Authorization = `Basic ${basic}`

    if (request.signed) {
      if (!this.webhookSecret) {
        throw new WooCommerceClientError('Signed endpoint is not configured', null, 'missing_webhook_secret')
      }
      const timestamp = String(Math.floor(Date.now() / 1000))
      headers['x-cartgain-timestamp'] = timestamp
      headers['x-cartgain-signature'] = signPluginRequest(this.webhookSecret, timestamp, this.storeId, path)
      headers['x-cartgain-store-id'] = this.storeId
    }

    const fetchImpl = this.options.fetchImpl ?? fetch
    let lastStatus: number | null = null

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      let response: Response | null = null
      try {
        response = await fetchImpl(url.toString(), {
          method: request.method ?? 'GET',
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeoutMs),
          redirect: 'manual',
          cache: 'no-store',
        })
      } catch {
        if (attempt === this.options.maxRetries) {
          throw new WooCommerceClientError('Store API request failed', null, 'network_error')
        }
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs * (attempt + 1)))
        continue
      }

      lastStatus = safeStatus(response.status)
      if (response.status >= 300 && response.status < 400) {
        throw new WooCommerceClientError('Store API returned a redirect', lastStatus, 'unsafe_redirect')
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt === this.options.maxRetries) {
          throw new WooCommerceClientError('Store API is temporarily unavailable', lastStatus, 'retry_exhausted')
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, this.options.retryDelayMs * (attempt + 1))))
        continue
      }
      if (response.status === 401) {
        throw new WooCommerceClientError('Invalid WooCommerce credentials', 401, 'invalid_credentials')
      }
      if (response.status === 403) {
        throw new WooCommerceClientError('WooCommerce credentials lack permission', 403, 'insufficient_permission')
      }
      if (response.status === 404) {
        throw new WooCommerceClientError('WooCommerce resource not found', 404, 'not_found')
      }
      if (!response.ok) {
        throw new WooCommerceClientError(`WooCommerce ${label} failed`, lastStatus, 'request_failed')
      }

      const text = await response.text()
      if (!text) return {} as T
      try {
        return JSON.parse(text) as T
      } catch {
        throw new WooCommerceClientError('WooCommerce returned invalid JSON', lastStatus, 'invalid_json')
      }
    }

    throw new WooCommerceClientError('Store API request failed', lastStatus, 'network_error')
  }

  systemStatus(): Promise<Record<string, unknown>> {
    return this.fetchJson({ path: `${WC_PREFIX}/system_status`, label: 'system status' })
  }

  listProducts(options: PlatformListOptions = {}): Promise<unknown[]> {
    return this.fetchJson({
      path: `${WC_PREFIX}/products`,
      query: {
        page: options.page ?? 1,
        per_page: options.perPage ?? 50,
        after: options.after,
        status: options.status,
      },
      label: 'products',
    })
  }

  fetchProduct(productId: string): Promise<Record<string, unknown>> {
    return this.fetchJson({
      path: `${WC_PREFIX}/products/${encodeURIComponent(productId)}`,
      label: 'product',
    })
  }

  listVariations(productId: string, options: PlatformListOptions = {}): Promise<unknown[]> {
    return this.fetchJson({
      path: `${WC_PREFIX}/products/${encodeURIComponent(productId)}/variations`,
      query: { page: options.page ?? 1, per_page: options.perPage ?? 50, after: options.after },
      label: 'variations',
    })
  }

  listCustomers(options: PlatformListOptions = {}): Promise<unknown[]> {
    return this.fetchJson({
      path: `${WC_PREFIX}/customers`,
      query: { page: options.page ?? 1, per_page: options.perPage ?? 50, after: options.after },
      label: 'customers',
    })
  }

  listOrders(options: PlatformListOptions = {}): Promise<unknown[]> {
    return this.fetchJson({
      path: `${WC_PREFIX}/orders`,
      query: {
        page: options.page ?? 1,
        per_page: options.perPage ?? 50,
        after: options.after,
        status: options.status,
      },
      label: 'orders',
    })
  }

  fetchOrder(orderId: string): Promise<Record<string, unknown>> {
    return this.fetchJson({
      path: `${WC_PREFIX}/orders/${encodeURIComponent(orderId)}`,
      label: 'order',
    })
  }

  listCoupons(code?: string): Promise<unknown[]> {
    return this.fetchJson({
      path: `${WC_PREFIX}/coupons`,
      query: { page: 1, per_page: 10, search: code },
      label: 'coupons',
    })
  }

  createCoupon(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.fetchJson({
      method: 'POST',
      path: `${WC_PREFIX}/coupons`,
      body: payload,
      label: 'coupon creation',
    })
  }

  deleteCoupon(couponId: string): Promise<unknown> {
    return this.fetchJson({
      method: 'DELETE',
      path: `${WC_PREFIX}/coupons/${encodeURIComponent(couponId)}`,
      query: { force: 'true' },
      label: 'coupon revocation',
    })
  }

  pluginHealth(): Promise<Record<string, unknown>> {
    return this.fetchJson({
      path: `${PLUGIN_PREFIX}/health`,
      signed: true,
      label: 'plugin health',
    })
  }

  revokePluginKeys(): Promise<unknown> {
    return this.fetchJson({
      method: 'DELETE',
      path: `${PLUGIN_PREFIX}/credentials`,
      signed: true,
      label: 'plugin key revocation',
    })
  }
}
