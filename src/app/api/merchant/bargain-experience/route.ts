import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { defaultsUpdate, fromDb, getExperienceConfig, toDbUpdate } from '@/lib/bargain/experience/config'
import { DEFAULT_BARGAIN_EXPERIENCE } from '@/lib/bargain/experience/types'

export const dynamic = 'force-dynamic'

async function ensureStore(storeId: string, userId: string) {
  const store = await prisma.store.findFirst({ where: { id: storeId, userId } })
  if (store) return store
  return prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
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
    return NextResponse.json({ experience: config, defaults: DEFAULT_BARGAIN_EXPERIENCE })
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
    const { storeId, action, ...exp } = body
    if (!storeId) return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    if (action !== 'draft' && action !== 'publish') {
      return NextResponse.json({ message: 'action must be draft or publish' }, { status: 400 })
    }
    const store = await ensureStore(storeId, session.user.id)
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

    const { raw } = await getExperienceConfig(store.id, 'draft')
    const update = toDbUpdate(exp, action, raw)
    const config = await prisma.bargainConfig.upsert({
      where: { storeId: store.id },
      create: { storeId: store.id, enabled: true, ...update },
      update,
    })
    return NextResponse.json({ experience: fromDb(config, 'draft') })
  } catch (error) {
    console.error('[BARGAIN_EXPERIENCE_PUT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const { storeId } = body
    if (!storeId) return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    const store = await ensureStore(storeId, session.user.id)
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

    const { raw } = await getExperienceConfig(store.id, 'draft')
    const update = defaultsUpdate(raw)
    const config = await prisma.bargainConfig.upsert({
      where: { storeId: store.id },
      create: { storeId: store.id, enabled: true, ...update },
      update,
    })
    return NextResponse.json({ experience: fromDb(config, 'draft') })
  } catch (error) {
    console.error('[BARGAIN_EXPERIENCE_POST]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
