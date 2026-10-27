import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import {
  defaultsUpdate,
  experienceMirror,
  fromDb,
  getExperienceConfig,
  sanitizeExperience,
  toDbUpdate,
} from '@/lib/bargain/experience/config'
import { DEFAULT_BARGAIN_EXPERIENCE, type BargainExperienceConfig } from '@/lib/bargain/experience/types'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const MAX_HISTORY = 20

async function ensureStore(storeId: string, userId: string) {
  const store = await prisma.store.findFirst({ where: { id: storeId, userId } })
  if (store) return store
  return prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
}

function asVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
}

function actor(session: any): string | null {
  return session?.user?.email || session?.user?.id || null
}

async function recordPublish(
  tx: any,
  storeId: string,
  config: any,
  action: 'publish' | 'rollback' | 'defaults',
  publishedBy: string | null
) {
  if (!config?.experiencePublished) return
  const version = asVersion(config.experiencePublishedVersion)
  await tx.bargainExperiencePublish.create({
    data: {
      storeId,
      version,
      action,
      config: config.experiencePublished as Prisma.InputJsonValue,
      publishedBy,
    },
  })
  const stale = await tx.bargainExperiencePublish.findMany({
    where: { storeId },
    orderBy: { version: 'desc' },
    skip: MAX_HISTORY,
    select: { id: true },
  })
  if (stale.length > 0) {
    await tx.bargainExperiencePublish.deleteMany({ where: { id: { in: stale.map((row: any) => row.id) } } })
  }
}

async function historyFor(storeId: string) {
  const rows = await prisma.bargainExperiencePublish.findMany({
    where: { storeId },
    orderBy: { version: 'desc' },
    take: MAX_HISTORY,
  })
  return rows.map((row: any) => ({
    id: row.id,
    version: row.version,
    action: row.action,
    publishedBy: row.publishedBy,
    createdAt: row.createdAt,
    config: sanitizeExperience(row.config),
  }))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    const store = await ensureStore(storeId, session.user.id)
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    const { config } = await getExperienceConfig(store.id, 'draft')
    const history = await historyFor(store.id)
    return NextResponse.json({ experience: config, defaults: DEFAULT_BARGAIN_EXPERIENCE, history })
  } catch (error) {
    console.error('[BARGAIN_EXPERIENCE_GET]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const { storeId, action, expectedDraftVersion, ...exp } = body
    if (!storeId) return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    if (action !== 'draft' && action !== 'publish') {
      return NextResponse.json({ message: 'action must be draft or publish' }, { status: 400 })
    }
    const store = await ensureStore(storeId, session.user.id)
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

    const { raw } = await getExperienceConfig(store.id, 'draft')
    if (expectedDraftVersion !== undefined && asVersion(expectedDraftVersion) !== asVersion(raw?.experienceDraftVersion)) {
      return NextResponse.json({
        message: 'This draft was changed in another tab. Reload before saving.',
        code: 'DRAFT_VERSION_CONFLICT',
        currentDraft: fromDb(raw, 'draft'),
      }, { status: 409 })
    }

    const update = toDbUpdate(exp, action, raw)
    const config = await prisma.$transaction(async (tx) => {
      const next = await tx.bargainConfig.upsert({
        where: { storeId: store.id },
        create: { storeId: store.id, enabled: true, ...update },
        update,
      })
      if (action === 'publish') {
        await recordPublish(tx, store.id, next, 'publish', actor(session))
      }
      return next
    })
    return NextResponse.json({ experience: fromDb(config, 'draft') })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ message: 'Another publish just completed. Reload and try again.', code: 'PUBLISH_CONFLICT' }, { status: 409 })
    }
    console.error('[BARGAIN_EXPERIENCE_PUT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const { storeId, action = 'defaults', version } = body
    if (!storeId) return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    if (action !== 'defaults' && action !== 'rollback') {
      return NextResponse.json({ message: 'action must be defaults or rollback' }, { status: 400 })
    }
    const store = await ensureStore(storeId, session.user.id)
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

    const { raw } = await getExperienceConfig(store.id, 'draft')
    let update: any
    let historyAction: 'defaults' | 'rollback' = 'defaults'

    if (action === 'rollback') {
      const targetVersion = asVersion(version)
      const row = await prisma.bargainExperiencePublish.findUnique({
        where: { storeId_version: { storeId: store.id, version: targetVersion } },
      })
      if (!row) return NextResponse.json({ message: 'Published version not found' }, { status: 404 })
      const restored = sanitizeExperience(row.config, fromDb(raw, 'draft'))
      const draftVersion = asVersion(raw?.experienceDraftVersion) + 1
      const publishedVersion = asVersion(raw?.experiencePublishedVersion) + 1
      const draft: BargainExperienceConfig = { ...restored, draftVersion, publishedVersion }
      update = {
        experienceDraft: draft,
        experiencePublished: draft,
        experienceDraftVersion: draftVersion,
        experiencePublishedVersion: publishedVersion,
        ...experienceMirror(draft),
      }
      historyAction = 'rollback'
    } else {
      update = defaultsUpdate(raw)
    }

    const config = await prisma.$transaction(async (tx) => {
      const next = await tx.bargainConfig.upsert({
        where: { storeId: store.id },
        create: { storeId: store.id, enabled: true, ...update },
        update,
      })
      await recordPublish(tx, store.id, next, historyAction, actor(session))
      return next
    })
    return NextResponse.json({ experience: fromDb(config, 'draft') })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ message: 'Another publish just completed. Reload and try again.', code: 'PUBLISH_CONFLICT' }, { status: 409 })
    }
    console.error('[BARGAIN_EXPERIENCE_POST]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
