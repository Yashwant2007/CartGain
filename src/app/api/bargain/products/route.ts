import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import {
  bargainProductBulkUpsertSchema,
  bargainProductUpsertSchema,
  validateOrThrow,
  handleValidationError,
} from '@/lib/validation/bargain'
import type { BargainProductUpsertInput } from '@/lib/validation/bargain'

export const dynamic = 'force-dynamic'

// GET /api/bargain/products?storeId=xxx&cursor=yyy&take=50
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

    const cursor = request.nextUrl.searchParams.get('cursor')
    const take = Math.min(parseInt(request.nextUrl.searchParams.get('take') || '50'), 200)
    const onlyBargainable = request.nextUrl.searchParams.get('bargainable')

    const products = await prisma.bargainProduct.findMany({
      where: {
        storeId,
        ...(onlyBargainable === 'true' ? { isBargainable: true } : {}),
        ...(onlyBargainable === 'false' ? { isBargainable: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = products.length > take
    const items = hasMore ? products.slice(0, take) : products
    const nextCursor = hasMore ? items[items.length - 1].id : null

    return NextResponse.json({ products: items, nextCursor, hasMore })
  } catch (error) {
    console.error('[BARGAIN_PRODUCTS_GET]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json({ message: 'Feature not ready. Run database migrations.' }, { status: 500 })
    }
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

// POST /api/bargain/products — single upsert: { storeId, ...productFields }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeId, ...productFields } = body
    if (!storeId || typeof storeId !== 'string') {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const data = validateOrThrow(bargainProductUpsertSchema, productFields)

    const product = await prisma.bargainProduct.upsert({
      where: {
        storeId_shopifyProductId: {
          storeId,
          shopifyProductId: data.shopifyProductId,
        },
      },
      create: { storeId, ...data },
      update: {
        ...data,
        shopifyProductId: undefined, // unique key — don't update
      },
    })

    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_PRODUCT_POST]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json({ message: 'Feature not ready. Run database migrations.' }, { status: 500 })
    }
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

// PUT /api/bargain/products — bulk upsert: { storeId, products: [...] }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeId, products: rawProducts } = body
    if (!storeId || typeof storeId !== 'string') {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const { products } = validateOrThrow(bargainProductBulkUpsertSchema, { products: rawProducts })

    const ops = products.map((p: BargainProductUpsertInput) =>
      prisma.bargainProduct.upsert({
        where: {
          storeId_shopifyProductId: {
            storeId,
            shopifyProductId: p.shopifyProductId,
          },
        },
        create: { storeId, ...p },
        update: { ...p, shopifyProductId: undefined },
      })
    )

    const result = await prisma.$transaction(ops)
    return NextResponse.json({ updated: result.length, products: result })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_PRODUCTS_PUT]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json({ message: 'Feature not ready. Run database migrations.' }, { status: 500 })
    }
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

// DELETE /api/bargain/products?id=xxx — delete a single product override
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ message: 'id is required' }, { status: 400 })
    }

    const product = await prisma.bargainProduct.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ message: 'Product override not found' }, { status: 404 })
    }

    const store = await prisma.store.findFirst({
      where: { id: product.storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    await prisma.bargainProduct.delete({ where: { id } })
    return NextResponse.json({ message: 'Product override deleted' })
  } catch (error) {
    console.error('[BARGAIN_PRODUCT_DELETE]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json({ message: 'Feature not ready. Run database migrations.' }, { status: 500 })
    }
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
