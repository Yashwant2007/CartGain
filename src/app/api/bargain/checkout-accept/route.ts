import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'

export const dynamic = 'force-dynamic'

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
    const { shopDomain, shopifyProductId, variantId, originalPrice, finalPrice, discountPercent, code, orderLevel } = body

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

    // Verify the discount percent matches
    const calculatedPercent = Math.round((1 - finalPrice / originalPrice) * 100)
    if (discountPercent && Math.abs(discountPercent - calculatedPercent) > 1) {
      return NextResponse.json({ message: 'Discount percent mismatch' }, { status: 400, headers })
    }

    // Generate the discount code in Shopify
    const result = await generateBargainDiscountCode({
      store,
      shopifyProductId: orderLevel ? null : shopifyProductId,
      variantId: orderLevel ? null : variantId || null,
      originalPrice,
      finalPrice,
      discountPercent: calculatedPercent,
      code,
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