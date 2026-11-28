import {
  normalizeCartContext,
  type CartContext,
  type CartModeConfig,
} from '@/lib/bargain/cart-context'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { getWooCommerceProductFacts } from '@/lib/woocommerce/bargain-adapter'

export interface VerifyCartContextOptions {
  store: any
  platform: 'shopify' | 'woocommerce' | string
  config?: any
  expectedCartToken?: string | null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function modeConfig(config: any): CartModeConfig {
  const enabled = config?.bundleNegotiationEnabled === true
  return { bundleOffersEnabled: enabled, cartWideBargainingEnabled: enabled }
}

export async function resolveVerifiedCartContext(
  raw: unknown,
  options: VerifyCartContextOptions,
): Promise<CartContext | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const config = modeConfig(options.config)
  const context = normalizeCartContext({ ...(raw as Record<string, unknown>), config, source: 'client' })
  if (!context || context.mode === 'product_only') return null
  if (options.expectedCartToken && context.cartToken && context.cartToken !== options.expectedCartToken) {
    return null
  }
  if (context.lines.length === 0 || context.lines.length > 8) return null

  const verifiedLines: CartContext['lines'] = []
  for (const line of context.lines) {
    const productId = line.productId || line.variantId
    if (!productId) return null
    const currentPrice = options.platform === 'woocommerce'
      ? (await getWooCommerceProductFacts({
          store: options.store,
          productId,
          variantId: line.variantId,
          fallbackPrice: line.unitPrice,
        }))?.price ?? null
      : await fetchShopifyProductPrice(options.store, productId, line.variantId)
    if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return null
    const tolerance = Math.max(1, currentPrice * 0.01)
    if (Math.abs(line.unitPrice - currentPrice) > tolerance) return null
    verifiedLines.push({
      ...line,
      unitPrice: round2(currentPrice),
      lineTotal: round2(currentPrice * line.quantity),
    })
  }

  const subtotal = round2(verifiedLines.reduce((sum, line) => sum + line.lineTotal, 0))
  if (subtotal <= 0) return null
  if (Math.abs(context.subtotal - subtotal) > Math.max(1, subtotal * 0.01)) return null

  return normalizeCartContext({
    ...(raw as Record<string, unknown>),
    config,
    source: 'server',
    lines: verifiedLines,
    subtotal,
    totalValue: context.totalValue > 0 ? context.totalValue : subtotal,
  })
}
