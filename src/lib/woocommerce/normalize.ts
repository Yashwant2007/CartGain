import type {
  PlatformOrderRecord,
  PlatformProductRecord,
} from '@/lib/platforms/types'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null
}

function text(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function integer(value: unknown): number | null {
  const parsed = number(value)
  return parsed === null ? null : Math.trunc(parsed)
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function date(value: unknown): Date | null {
  const raw = text(value)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const result = text(value)
    if (result) return result
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const result = number(value)
    if (result !== null) return result
  }
  return null
}

function firstInteger(...values: unknown[]): number | null {
  const result = firstNumber(...values)
  return result === null ? null : Math.trunc(result)
}

function imageUrl(value: unknown): string | null {
  const direct = text(value)
  if (direct) return direct
  const imageRecord = record(value)
  return firstText(imageRecord?.src, imageRecord?.url, imageRecord?.thumbnail)
}

function normalizeCategories(raw: unknown): unknown[] {
  return array(raw)
    .map((entry) => {
      const category = record(entry)
      if (!category) return null
      const id = text(category.id)
      const name = text(category.name)
      const slug = text(category.slug)
      return id || name || slug ? { id, name, slug } : null
    })
    .filter(Boolean)
}

function normalizeAttributes(raw: unknown): unknown[] {
  return array(raw)
    .map((entry) => {
      const attribute = record(entry)
      if (!attribute) return null
      const values = array(attribute.values).map(text).filter((value): value is string => Boolean(value))
      return {
        id: text(attribute.id) ?? text(attribute.key),
        name: text(attribute.name),
        option: text(attribute.option) || text(attribute.value) || values[0] || null,
        values: values.length ? values : undefined,
        variation: typeof attribute.variation === 'boolean' ? attribute.variation : undefined,
        visible: typeof attribute.visible === 'boolean' ? attribute.visible : undefined,
      }
    })
    .filter(Boolean)
}

function normalizeVariationReferences(raw: unknown): unknown[] {
  return array(raw).map((entry) => {
    const variation = record(entry)
    return variation ? variation.id ?? null : entry
  })
}

export function normalizeProduct(raw: unknown, variationsRaw: unknown[] = []): {
  product: PlatformProductRecord | null
  variations: PlatformProductRecord[]
} {
  const source = record(raw)
  const prices = record(source?.prices)
  const inventory = record(source?.inventory)
  const productId = firstText(source?.id, source?.product_id)
  if (!productId) return { product: null, variations: [] }

  const product: PlatformProductRecord = {
    platformProductId: productId,
    kind: 'product',
    name: firstText(source?.name, source?.title),
    description: firstText(source?.description, source?.shortDescription, source?.short_description),
    imageUrl: imageUrl(array(source?.images)[0]),
    regularPrice: firstNumber(source?.regular_price, prices?.regularPrice, source?.price, prices?.price),
    salePrice: number(source?.sale_price ?? prices?.salePrice),
    sku: text(source?.sku),
    categories: normalizeCategories(source?.categories),
    inventoryQuantity: firstInteger(source?.stock_quantity, inventory?.stockQuantity, inventory?.quantity),
    stockStatus: firstText(source?.stock_status, inventory?.stockStatus),
    attributes: normalizeAttributes(source?.attributes),
    variations: normalizeVariationReferences(source?.variations),
    status: text(source?.status),
    raw: source,
  }

  const embeddedVariations = variationsRaw.length
    ? variationsRaw
    : array(source?.variations).filter((entry) => record(entry) !== null)
  const variations = embeddedVariations.reduce<PlatformProductRecord[]>((out, entry) => {
    const sourceVariation = record(entry)
    const variationId = firstText(sourceVariation?.id, sourceVariation?.variation_id)
    if (!sourceVariation || !variationId) return out
    const variationPrices = record(sourceVariation.prices)
    const variationInventory = record(sourceVariation.inventory)
    const variationProductId = text(sourceVariation.parentId) ?? productId
    out.push({
      platformProductId: variationProductId,
      platformVariantId: variationId,
      variantKey: variationId,
      parentProductId: variationProductId,
      kind: 'variation',
      name: firstText(sourceVariation.name, source?.name),
      description: firstText(sourceVariation.description, source?.description),
      imageUrl: imageUrl(sourceVariation.image ?? array(sourceVariation.images)[0]),
      regularPrice: firstNumber(
        sourceVariation.regular_price,
        variationPrices?.regularPrice,
        sourceVariation.price,
        variationPrices?.price,
      ),
      salePrice: number(sourceVariation.sale_price ?? variationPrices?.salePrice),
      sku: text(sourceVariation.sku),
      categories: product.categories,
      inventoryQuantity: firstInteger(
        sourceVariation.stock_quantity,
        variationInventory?.stockQuantity,
        variationInventory?.quantity,
      ),
      stockStatus: firstText(sourceVariation.stock_status, variationInventory?.stockStatus),
      attributes: normalizeAttributes(sourceVariation?.attributes),
      variations: [],
      status: text(sourceVariation?.status) || text(source?.status),
      raw: sourceVariation,
    })
    return out
  }, [])

  return { product, variations }
}

export type NormalizedCartItem = {
  key?: string | null
  productId?: string | null
  variationId?: string | null
  name?: string | null
  quantity?: number | null
  price?: number | null
  lineTotal?: number | null
  imageUrl?: string | null
  sku?: string | null
  inventory?: number | null
  stockStatus?: string | null
  raw?: UnknownRecord | null
}

export function normalizeCartItems(raw: unknown): NormalizedCartItem[] {
  const items: Array<NormalizedCartItem | null> = array(raw)
    .map((entry) => {
      const item = record(entry)
      if (!item) return null
      const key = firstText(item.key, item.item_key)
      const productId = firstText(item.product_id, item.productId, item.id)
      const variationId = firstText(item.variation_id, item.variationId, item.variant_id)
      return {
        key: key || `${productId ?? 'item'}:${variationId ?? 'default'}`,
        productId,
        variationId,
        name: firstText(item.name, item.title),
        quantity: integer(item.quantity),
        price: firstNumber(item.price, item.line_price, item.subtotal),
        lineTotal: firstNumber(item.lineTotal, item.line_total, item.total, item.subtotal),
        imageUrl: imageUrl(item.imageUrl ?? item.image ?? array(item.images)[0]),
        sku: text(item.sku),
        inventory: firstNumber(
          item.inventory,
          item.inventory_quantity,
          item.stock_quantity,
          record(item.stock)?.quantity,
          record(item.inventory_data)?.quantity,
        ),
        stockStatus: firstText(item.stockStatus, item.stock_status, record(item.stock)?.status),
        raw: item,
      }
    })
  return items.filter((entry): entry is NormalizedCartItem => entry !== null)
}

export function mergeCartItems(existing: unknown, incoming: NormalizedCartItem[]): NormalizedCartItem[] {
  const previous = normalizeCartItems(existing)
  const byKey = new Map(previous.map((item) => [item.key, item]))
  return incoming.map((item) => {
    const old = byKey.get(item.key)
    if (!old) return item
    return {
      ...item,
      quantity: item.quantity ?? old.quantity,
      price: item.price ?? old.price,
      lineTotal: item.lineTotal ?? old.lineTotal,
      imageUrl: item.imageUrl ?? old.imageUrl,
      sku: item.sku ?? old.sku,
      inventory: item.inventory ?? old.inventory,
      stockStatus: item.stockStatus ?? old.stockStatus,
    }
  })
}

export type NormalizedCustomer = {
  externalCustomerId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}

export function normalizeCustomer(raw: unknown): NormalizedCustomer {
  const source = record(raw) ?? {}
  const billing = record(source.billing) ?? {}
  const shipping = record(source.shipping) ?? {}
  const firstName = firstText(source.first_name, billing.first_name, shipping.first_name)
  const lastName = firstText(source.last_name, billing.last_name, shipping.last_name)
  const name = firstText(
    source.name,
    source.display_name,
    [firstName, lastName].filter(Boolean).join(' '),
  )
  return {
    externalCustomerId: firstText(source.id, source.customer_id, source.externalCustomerId),
    name,
    email: firstText(source.email, billing.email),
    phone: firstText(source.phone, billing.phone, shipping.phone),
  }
}

export type NormalizedCart = {
  cartId: string
  items: NormalizedCartItem[]
  total: number
  currency?: string | null
  customer: NormalizedCustomer
}

export function normalizeCartEvent(data: unknown): NormalizedCart | null {
  const root = record(data) ?? {}
  const source = record(root.cart) ?? root
  const cartId = firstText(source.id, source.cart_id, source.cartId, source.token, source.cart_token)
  const total = firstNumber(source.total, source.total_price, source.subtotal)
  const items = normalizeCartItems(source.items ?? source.line_items)
  if (!cartId || total === null || items.length === 0) return null
  const customerSource = source.customer ?? root.customer ?? {}
  return {
    cartId,
    items,
    total,
    currency: firstText(source.currency, root.currency),
    customer: normalizeCustomer(customerSource),
  }
}

function normalizeOrderItems(raw: unknown): unknown[] {
  return array(raw)
    .map((entry) => {
      const item = record(entry)
      if (!item) return null
      return {
        id: text(item.id),
        productId: text(item.product_id),
        variationId: text(item.variation_id),
        name: text(item.name),
        quantity: integer(item.quantity),
        price: firstNumber(item.price, item.subtotal),
        total: number(item.total),
        sku: text(item.sku),
        imageUrl: imageUrl(item.image),
      }
    })
    .filter(Boolean)
}

function normalizeCouponCodes(raw: unknown): string[] {
  const codes = array(raw)
    .map((entry) => {
      const coupon = record(entry)
      return firstText(coupon?.code, entry)
    })
    .filter((value): value is string => Boolean(value))
  return Array.from(new Set(codes))
}

export function normalizeOrderEvent(data: unknown): PlatformOrderRecord | null {
  const root = record(data) ?? {}
  const source = record(root.order) ?? root
  const orderId = firstText(source.id, source.order_id, source.orderId)
  if (!orderId) return null
  const billing = record(source.billing) ?? {}
  const customer = normalizeCustomer(source.customer ?? source)
  const refunds = array(source.refund_lines ?? source.refunds).reduce<number>((sum, entry) => {
    const refund = record(entry)
    const value = number(refund?.total ?? refund?.amount)
    return sum + Math.abs(value ?? 0)
  }, 0)

  return {
    platformOrderId: orderId,
    cartId: firstText(source.cart_id, source.cartId, source.cart_hash, root.cartId),
    externalCustomerId: firstText(customer.externalCustomerId, source.customer_id),
    status: text(source.status),
    currency: text(source.currency),
    total: firstNumber(source.total, source.total_price, source.order_total) ?? 0,
    refundedTotal: refunds,
    customerEmail: firstText(customer.email, billing.email, source.billing_email),
    customerPhone: firstText(customer.phone, billing.phone, source.billing_phone),
    customerName: firstText(customer.name, source.customer_name),
    items: normalizeOrderItems(source.line_items),
    couponCodes: normalizeCouponCodes(source.coupon_lines ?? source.discount_codes),
    placedAt: date(source.date_created ?? source.created_at ?? source.placedAt),
    paidAt: date(source.date_paid ?? source.paidAt),
    cancelledAt: date(source.date_cancelled ?? source.cancelledAt),
    refundedAt: date(source.date_refunded ?? source.refundedAt),
    raw: source,
  }
}
