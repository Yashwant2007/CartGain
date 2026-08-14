import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'

export const dynamic = 'force-dynamic'

// POST /api/bargain/checkout-accept — called from Checkout UI Extension when bargain accepted
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shopDomain, shopifyProductId, variantId, originalPrice, finalPrice, discountPercent, code } = body

    if (!shopDomain || !shopifyProductId || !originalPrice || !finalPrice || !code) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Find store by domain
    const store = await prisma.store.findUnique({
      where: { domain: shopDomain.replace('.myshopify.com', '') },
    })

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    // Verify the discount percent matches
    const calculatedPercent = Math.round((1 - finalPrice / originalPrice) * 100)
    if (discountPercent && Math.abs(discountPercent - calculatedPercent) > 1) {
      return NextResponse.json({ message: 'Discount percent mismatch' }, { status: 400 })
    }

    // Generate the discount code in Shopify
    const result = await generateBargainDiscountCode({
      store,
      shopifyProductId,
      variantId: variantId || null,
      originalPrice,
      finalPrice,
      discountPercent: calculatedPercent,
      code,
    })

    if (result.status === 'failed') {
      return NextResponse.json({ message: result.error || 'Failed to create discount code' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      code: result.code,
      status: result.status,
    })
  } catch (error) {
    console.error('[BARGAIN_CHECKOUT_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}