import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { fetchShopifyProducts } from '@/lib/shopify'
import {
  hasActiveWooCommerceConnection,
  listPlatformProducts,
  platformProductId,
  platformProductPrice,
  platformProductVariantId,
  productField,
} from '@/lib/woocommerce/bargain-adapter'

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
    if (store.platform === 'woocommerce') {
      if (!(await hasActiveWooCommerceConnection(store))) {
        return NextResponse.json({ message: 'Store not connected' }, { status: 404 })
      }
      const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? ''
      const rows = await listPlatformProducts(store.id)
      const overrides = await prisma.bargainProduct.findMany({
        where: { storeId: store.id },
        orderBy: { updatedAt: 'desc' },
      })
      const overrideMap = new Map<string, any>()
      for (const override of overrides) {
        const id = platformProductId(override) ?? override.shopifyProductId
        if (id) overrideMap.set(String(id), override)
      }
      const filtered = q
        ? rows.filter((row) => {
            const id = platformProductId(row) ?? ''
            const title = String(productField(row, ['title', 'name']) ?? '')
            return id.toLowerCase().includes(q) || title.toLowerCase().includes(q)
          })
        : rows
      const merged = filtered.map((row) => {
        const id = platformProductId(row) ?? ''
        const override = overrideMap.get(id)
        const price = platformProductPrice(row) ?? 0
        const variantId = platformProductVariantId(row)
        const image = productField(row, ['imageUrl', 'image', 'images'])
        const imageSrc =
          typeof image === 'string'
            ? image
            : Array.isArray(image)
              ? (typeof image[0] === 'string' ? image[0] : (image[0] as any)?.src ?? null)
              : (image as any)?.src ?? (image as any)?.url ?? null
        return {
          product: {
            id,
            title: String(productField(row, ['title', 'name']) ?? id),
            handle: String(productField(row, ['handle', 'slug']) ?? id),
            status: String(productField(row, ['status', 'state']) ?? 'active'),
            body_html: productField(row, ['description', 'bodyHtml']) ?? null,
            image: imageSrc ? { src: imageSrc } : null,
            images: imageSrc ? [{ src: imageSrc }] : [],
            variants: [{
              id: variantId ?? id,
              title: 'Default',
              price: String(price),
              available: true,
            }],
          },
          bargains: override
            ? {
                overrideId: override.id,
                enabled: override.isBargainable,
                minPrice: override.minPrice,
                maxDiscountPercent: override.maxDiscountPercent,
              }
            : { overrideId: null, enabled: true, minPrice: null, maxDiscountPercent: null },
        }
      })
      const seen = new Set(merged.map((entry) => entry.product.id))
      const orphanOverrides = overrides.filter((override) => {
        const id = platformProductId(override) ?? override.shopifyProductId
        return !seen.has(String(id))
      })
      return NextResponse.json({
        products: merged,
        nextCursor: null,
        prevCursor: null,
        orphanOverrides,
        overrides,
        savedOverrides: overrides.map((o) => ({
          id: o.id,
          shopifyProductId: platformProductId(o) ?? o.shopifyProductId,
          platformProductId: platformProductId(o) ?? o.shopifyProductId,
          productTitle: o.productTitle,
          minPrice: o.minPrice,
          minProfitPercent: o.minProfitPercent,
          maxDiscountPercent: o.maxDiscountPercent,
          isBargainable: o.isBargainable,
          updatedAt: o.updatedAt,
        })),
        error: null,
        platform: 'woocommerce',
      })
    }

    if (store.platform !== 'shopify') {
      return NextResponse.json({
        message: `Products is available for Shopify stores. This store is on ${store.platform}.`,
        products: [], nextCursor: null, prevCursor: null, overrides: [], platform: store.platform,
      }, { status: 200 })
    }

    const cursor = request.nextUrl.searchParams.get('cursor') || undefined
    const rawQuery = request.nextUrl.searchParams.get('q') || undefined
    // Shopify's REST product query only does field filters, so a bare numeric
    // search must be translated to `id:` instead of being treated as free text.
    const q = rawQuery?.trim()
      ? /^(#|gid:\/\/shopify\/Product\/)?\d+$/.test(rawQuery.trim())
        ? `id:${rawQuery.trim().replace(/^#/, '').replace(/^gid:\/\/shopify\/Product\//, '')}`
        : rawQuery.trim()
      : undefined

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
        overrides, savedOverrides: overrides.map(o => ({
          id: o.id,
          shopifyProductId: o.shopifyProductId,
          productTitle: o.productTitle,
          minPrice: o.minPrice,
          minProfitPercent: o.minProfitPercent,
          maxDiscountPercent: o.maxDiscountPercent,
          isBargainable: o.isBargainable,
          updatedAt: o.updatedAt,
        })), platform: 'shopify',
      }, { status: 200 })
    }

    // Merge overrides into the fetched catalog for quick status/floor display.
    const overrideMap = new Map<string, { id: string; minPrice: number | null; minProfitPercent: number | null; maxDiscountPercent: number | null; isBargainable: boolean; productTitle: string | null }>()
    const overrides = await prisma.bargainProduct.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
    })
    for (const o of overrides) {
      overrideMap.set(o.shopifyProductId, {
        id: o.id,
        minPrice: o.minPrice,
        minProfitPercent: o.minProfitPercent,
        maxDiscountPercent: o.maxDiscountPercent,
        isBargainable: o.isBargainable,
        productTitle: o.productTitle,
      })
    }

    interface Merged {
      product: any
      bargains: {
        overrideId: string | null
        enabled: boolean
        minPrice: number | null
        maxDiscountPercent: number | null
      }
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
          ? {
              overrideId: ov.id,
              enabled: ov.isBargainable,
              minPrice: ov.minPrice,
              maxDiscountPercent: ov.maxDiscountPercent,
            }
          : { overrideId: null, enabled: true, minPrice: null, maxDiscountPercent: null },
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
      savedOverrides: overrides.map(o => ({
        id: o.id,
        shopifyProductId: o.shopifyProductId,
        productTitle: o.productTitle,
        minPrice: o.minPrice,
        minProfitPercent: o.minProfitPercent,
        maxDiscountPercent: o.maxDiscountPercent,
        isBargainable: o.isBargainable,
        updatedAt: o.updatedAt,
      })),
      error: null,
      platform: 'shopify',
    })
  } catch (err) {
    console.error('[BARGAIN_CATALOG_GET]', err)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}