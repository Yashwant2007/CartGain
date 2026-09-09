import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { computeMinPrice } from '@/lib/services/bargain'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { buildExecutablePrice, clampOrderPercentForProduct } from '@/lib/financial-safety'
import { redisIncr, redisExpire } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// Public (storefront + checkout) tier — cap how many discount codes each shop
// can mint per hour to prevent spam, while staying generous for real traffic.
const MAX_CODES_PER_SHOP_HOUR = 250
const CODE_WINDOW_SECONDS = 60 * 60

async function underCodeBudget(shopKey: string): Promise<boolean> {
  try {
    const count = await redisIncr(`bargain:codes:${shopKey}`)
    if (count === 1) {
      await redisExpire(`bargain:codes:${shopKey}`, CODE_WINDOW_SECONDS * 1000)
    }
    return count <= MAX_CODES_PER_SHOP_HOUR
  } catch {
    return true
  }
}

// Checkout UI extensions run on https://checkout.shopify.com — allow those
// cross-origin requests (plus the storefront admin/preview origins).
const ALLOWED_ORIGINS = [
  'https://checkout.shopify.com',
  'https://cart-gain.com',
  /^https:\/\/[a-z0-9-]+\.myshopify\.com$/,
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some(
    (o) => o === origin || (o instanceof RegExp && o.test(origin))
  )
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

// POST /api/bargain/checkout-accept — called from Checkout UI Extension when bargain accepted
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))
  try {
    const body = await request.json()
    const { shopDomain, shopifyProductId, variantId, originalPrice, finalPrice, discountPercent, code, orderLevel, bulkQuantity } = body

    if (!shopDomain || !originalPrice || !finalPrice || !code) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400, headers })
    }

    // Find store by domain (domain is not unique alone, use findFirst)
    const cleanDomain = shopDomain.replace('.myshopify.com', '')
    const store = await prisma.store.findFirst({
      where: { domain: cleanDomain },
    })

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404, headers })
    }

    const withinBudget = await underCodeBudget(cleanDomain)
    if (!withinBudget) {
      return NextResponse.json(
        { message: 'Too many codes generated for this store recently. Try again later.' },
        { status: 429, headers }
      )
    }

    const rawBulk = bulkQuantity != null ? Math.floor(Number(bulkQuantity)) : null
    const safeBulk = rawBulk != null && Number.isFinite(rawBulk) && rawBulk >= 1 ? rawBulk : null

    // ── FINANCIAL SAFETY ──
    // This endpoint mints codes purely from client-supplied values (the Checkout
    // UI Extension cannot carry a bargain session), so the merchant floor must be
    // enforced HERE, mathematically, from the AUTHORITATIVE current Shopify price.
    // 1) Re-fetch the price; reject when the client price drifted noticeably.
    const currentPrice =
      (await fetchShopifyProductPrice(store, shopifyProductId, variantId || null)) ?? null
    if (currentPrice == null) {
      return NextResponse.json({ message: 'Could not verify current product price' }, { status: 503, headers })
    }
    const ratio = originalPrice / currentPrice
    if (ratio < 0.995 || ratio > 1.005) {
      return NextResponse.json({ message: 'Price mismatch — product price has changed' }, { status: 409, headers })
    }

    // 2) Floor derived server-side from the merchant's own config/product overrides.
    const { minPrice } = await computeMinPrice({
      storeId: store.id,
      shopifyProductId,
      originalPrice: currentPrice,
      bulkQuantity: safeBulk ?? undefined,
    })

    let calculatedPercent: number
    let finalPriceSafe: number
    if (orderLevel) {
      // An order-level percentage discounts the WHOLE basket (unrelated items
      // too), so clamp its depth to the featured product's margin floor. This is
      // what keeps a "₹1 finalPrice" attack from converting into 99%-off-everything.
      const clientPercent = discountPercent != null
        ? Number(discountPercent)
        : 100 - (Number(finalPrice) / currentPrice) * 100
      const clamped = clampOrderPercentForProduct({
        originalPrice: currentPrice,
        floorPrice: minPrice,
        requestedPercent: clientPercent,
      })
      if (!clamped.ok) {
        return NextResponse.json(
          { message: `Discount exceeds merchant floor (max ${clamped.maxPercent.toFixed(2)}% off)` },
          { status: 409, headers }
        )
      }
      calculatedPercent = clamped.percent
      finalPriceSafe = currentPrice * (1 - clamped.percent / 100)
    } else {
      const executable = buildExecutablePrice({
        originalPrice: currentPrice,
        finalPrice: Number(finalPrice),
        floorPrice: minPrice,
        bulkQuantity: safeBulk,
      })
      if (!executable.ok) {
        return NextResponse.json(
          { message: 'Price mismatch — discount would breach merchant floor' },
          { status: 409, headers }
        )
      }
      calculatedPercent = executable.discountPercent
      finalPriceSafe = executable.finalPrice
    }

    // Generate the discount code in Shopify
    const result = await generateBargainDiscountCode({
      store,
      shopifyProductId: orderLevel ? null : shopifyProductId,
      variantId: orderLevel ? null : variantId || null,
      originalPrice: currentPrice,
      finalPrice: finalPriceSafe,
      discountPercent: calculatedPercent,
      code,
      bulkQuantity: safeBulk,
      floorPrice: minPrice,
    })

    if (result.status === 'failed') {
      return NextResponse.json({ message: result.error || 'Failed to create discount code' }, { status: 500, headers })
    }

    return NextResponse.json({
      success: true,
      code: result.code,
      status: result.status,
    }, { headers })
  } catch (error) {
    console.error('[BARGAIN_CHECKOUT_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500, headers })
  }
}