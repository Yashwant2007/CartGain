export type PlatformId = 'shopify' | 'woocommerce' | 'magento' | 'bigcommerce' | 'custom'

export type PlatformCredentials = {
  key: string
  secret: string
}

export type PlatformConnectionConfig = {
  storeId: string
  storeUrl: string
  credentials: PlatformCredentials
  webhookSecret?: string | null
  connectionId?: string | null
}

export type PlatformProfile = {
  externalId?: string | null
  name?: string | null
  url?: string | null
  currency?: string | null
  timezone?: string | null
  raw?: Record<string, unknown> | null
}

export type PlatformListOptions = {
  page?: number
  perPage?: number
  after?: string | null
  status?: string | null
}

export type PlatformProductRecord = {
  platformProductId: string
  platformVariantId?: string | null
  variantKey?: string
  parentProductId?: string | null
  kind: 'product' | 'variation'
  name?: string | null
  description?: string | null
  imageUrl?: string | null
  regularPrice?: number | null
  salePrice?: number | null
  sku?: string | null
  categories?: unknown
  inventoryQuantity?: number | null
  stockStatus?: string | null
  attributes?: unknown
  variations?: unknown
  status?: string | null
  raw?: Record<string, unknown> | null
}

export type PlatformOrderRecord = {
  platformOrderId: string
  cartId?: string | null
  externalCustomerId?: string | null
  status?: string | null
  currency?: string | null
  total: number
  subtotal?: number | null
  discountTotal?: number | null
  refundedTotal?: number
  customerEmail?: string | null
  customerPhone?: string | null
  customerName?: string | null
  items?: unknown
  couponCodes?: unknown
  placedAt?: Date | null
  paidAt?: Date | null
  cancelledAt?: Date | null
  refundedAt?: Date | null
  raw?: Record<string, unknown> | null
}

export type PlatformCouponInput = {
  code: string
  type: 'percentage' | 'fixed'
  value: number
  expiresAt?: Date | null
  usageLimit?: number
  minimumSubtotal?: number | null
  description?: string | null
}

export type PlatformCouponResult = {
  code: string
  status: 'created' | 'existing' | 'failed'
  verified: boolean
  errorCode?: string
}

export type PlatformHealthResult = {
  ok: boolean
  status: 'ok' | 'degraded' | 'unreachable'
  checks: Record<string, 'ok' | 'unavailable' | 'unknown'>
  checkedAt: Date
  errorCode?: string
}

export type PlatformVerifyResult = {
  verified: boolean
  profile?: PlatformProfile | null
  errorCode?: string
}

export type PlatformAdapter = {
  id: PlatformId
  verifyConnection(input: PlatformConnectionConfig): Promise<PlatformVerifyResult>
  fetchStoreProfile(input: PlatformConnectionConfig): Promise<PlatformProfile>
  listProducts(input: PlatformConnectionConfig, options?: PlatformListOptions): Promise<unknown[]>
  fetchProduct(input: PlatformConnectionConfig, productId: string): Promise<unknown>
  listOrders(input: PlatformConnectionConfig, options?: PlatformListOptions): Promise<unknown[]>
  createCoupon(input: PlatformConnectionConfig, coupon: PlatformCouponInput): Promise<PlatformCouponResult>
  revokeCoupon(input: PlatformConnectionConfig, code: string): Promise<boolean>
  verifyOrder(input: PlatformConnectionConfig, orderId: string): Promise<PlatformOrderRecord | null>
  healthCheck(input: PlatformConnectionConfig): Promise<PlatformHealthResult>
}
