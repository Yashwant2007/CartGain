import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { fetchShopifyProducts } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET /api/bargain/products/catalog?storeId=xxx&cursor=yyy&q=search
// Lists the merchant's Shopify catalog merged with any BargainProduct overrides
// so the dashboard can show bargainable status + per-product floors in one view.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }
    if (store.platform !== 'shopify') {
      return NextResponse.json({
        message: `Products is available for Shopify stores. This store is on ${store.platform}.`,
        products: [], nextCursor: null, prevCursor: null, overrides: [], platform: store.platform,
      }, { status: 200 })
    }

    const cursor = request.nextUrl.searchParams.get('cursor') || undefined
    const q = request.nextUrl.searchParams.get('q') || undefined

    const { products, nextCursor, prevCursor, error } = await fetchShopifyProducts(store, {
      pageInfo: cursor || null,
      query: q || null,
    })
    if (error) {
      // Still return existing overrides so the create/override list isn't lost.
      const overrides = await prisma.bargainProduct.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({
        message: error,
        products: [], nextCursor: null, prevCursor: null,
        overrides, platform: 'shopify',
      }, { status: 200 })
    }

    // Merge overrides into the fetched catalog for quick status/floor display.
    const overrideMap = new Map<string, { minPrice: number | null; minProfitPercent: number | null; maxDiscountPercent: number | null; isBargainable: boolean }>()
    const overrides = await prisma.bargainProduct.findMany({ where: { storeId } })
    for (const o of overrides) {
      overrideMap.set(o.shopifyProductId, {
        minPrice: o.minPrice,
        minProfitPercent: o.minProfitPercent,
        maxDiscountPercent: o.maxDiscountPercent,
        isBargainable: o.isBargainable,
      })
    }

    interface Merged {
      product: any
      bargains: { enabled: boolean; minPrice: number | null; maxDiscountPercent: number | null }
    }
    const merged: Merged[] = []
    const seen = new Set<string>()
    for (const p of products) {
      const id = String(p.id)
      seen.add(id)
      const ov = overrideMap.get(id)
      merged.push({
        product: p,
        bargains: ov
          ? { enabled: ov.isBargainable, minPrice: ov.minPrice, maxDiscountPercent: ov.maxDiscountPercent }
          : { enabled: true, minPrice: null, maxDiscountPercent: null },
      })
    }

    // Any overrides for products that didn't come back in this page (e.g. archived)
    // are still returned separately so nothing is ever silently lost.
    const orphanOverrides = overrides.filter(o => !seen.has(o.shopifyProductId))

    return NextResponse.json({
      products: merged,
      nextCursor: nextCursor ? encodeURIComponent(nextCursor) : null,
      prevCursor: prevCursor ? encodeURIComponent(prevCursor) : null,
      orphanOverrides,
      error: null,
      platform: 'shopify',
    })
  } catch (err) {
    console.error('[BARGAIN_CATALOG_GET]', err)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}