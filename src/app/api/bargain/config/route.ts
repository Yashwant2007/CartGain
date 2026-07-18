import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { bargainConfigUpsertSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'

export const dynamic = 'force-dynamic'

// GET /api/bargain/config?storeId=xxx — get current store bargain config (auto-creates defaults if missing)
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

    const config = await prisma.bargainConfig.upsert({
      where: { storeId },
      create: { storeId },
      update: {},
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[BARGAIN_CONFIG_GET]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

// PUT /api/bargain/config — body: { storeId, ...fields }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeId, ...fields } = body
    if (!storeId || typeof storeId !== 'string') {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const data = validateOrThrow(bargainConfigUpsertSchema, fields)

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

    const config = await prisma.bargainConfig.upsert({
      where: { storeId },
      create: { storeId, ...data },
      update: data,
    })

    return NextResponse.json({ config })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_CONFIG_PUT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
