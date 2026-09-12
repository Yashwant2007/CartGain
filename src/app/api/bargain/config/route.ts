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
      // A stale storeId (e.g. persisted in the dashboard URL from an earlier
      // install/account) must not brick the config tab. Fall back to that
      // user's primary store — same rule /api/stores/current follows.
      const fallback = await prisma.store.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
      })
      if (!fallback) {
        return NextResponse.json({ message: 'Store not found' }, { status: 404 })
      }
      const resolvedStoreId = fallback.id
      const config = await prisma.bargainConfig.upsert({
        where: { storeId: resolvedStoreId },
        create: { storeId: resolvedStoreId, enabled: true },
        update: {},
      })
      return NextResponse.json({ config, resolvedStoreId })
    }

    const config = await prisma.bargainConfig.upsert({
      where: { storeId },
      create: { storeId, enabled: true },
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

    let resolvedStoreId = storeId
    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      // Same stale-storeId fallback as GET.
      const fallback = await prisma.store.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
      })
      if (!fallback) {
        return NextResponse.json({ message: 'Store not found' }, { status: 404 })
      }
      resolvedStoreId = fallback.id
    }

    // Coerce ISO strings → Date for Prisma DateTime fields (null clears a value).
    const DATE_FIELDS = ['goalStartTime', 'goalEndTime', 'campaignStart', 'campaignEnd'] as const
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value === null) {
        clean[key] = null
        continue
      }
      if ((DATE_FIELDS as readonly string[]).includes(key) && typeof value === 'string') {
        clean[key] = new Date(value)
        continue
      }
      clean[key] = value
    }

    // Goal window integrity: start/end must both be present together and ordered.
    if (clean.goalEnabled === true || clean.goalStartTime != null || clean.goalEndTime != null) {
      const start = clean.goalStartTime as Date | null | undefined
      const end = clean.goalEndTime as Date | null | undefined
      if ((clean.goalStartTime == null) !== (clean.goalEndTime == null)) {
        return NextResponse.json(
          { message: 'goalStartTime and goalEndTime must be set together', status: 'error' },
          { status: 400 },
        )
      }
      if (start && end && start >= end) {
        return NextResponse.json(
          { message: 'goalEndTime must be after goalStartTime', status: 'error' },
          { status: 400 },
        )
      }
    }

    // Campaign window integrity (same rule): a campaign can be unbounded (no
    // window = whole goal window) but never half-configured or inverted —
    // otherwise the AI could be fed an expired/false campaign (spec §9/§28).
    if (clean.campaignStart != null || clean.campaignEnd != null) {
      const cStart = clean.campaignStart as Date | null | undefined
      const cEnd = clean.campaignEnd as Date | null | undefined
      if ((clean.campaignStart == null) !== (clean.campaignEnd == null)) {
        return NextResponse.json(
          { message: 'campaignStart and campaignEnd must be set together', status: 'error' },
          { status: 400 },
        )
      }
      if (cStart && cEnd && cStart >= cEnd) {
        return NextResponse.json(
          { message: 'campaignEnd must be after campaignStart', status: 'error' },
          { status: 400 },
        )
      }
    }

    const config = await prisma.bargainConfig.upsert({
      where: { storeId: resolvedStoreId },
      create: { storeId: resolvedStoreId, ...clean },
      update: clean,
    })

    return NextResponse.json({ config, resolvedStoreId })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_CONFIG_PUT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
