import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { loadLearningConfig } from '@/lib/bargain/learning/service'
import { learningConfigDefaults } from '@/lib/bargain/learning/strategies'
import { LEARNING_STRATEGIES } from '@/lib/bargain/learning/types'

export const dynamic = 'force-dynamic'

const CONFIG_STRATEGIES = LEARNING_STRATEGIES.filter((strategy) => strategy !== 'BASELINE')

async function resolveStore(userId: string, storeId: string | null) {
  if (!storeId) return null
  return prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } })
}

function readNumber(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number | NextResponse {
  const raw = body[key]
  if (raw === undefined) return fallback
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min || raw > max) {
    return NextResponse.json({ message: `${key} must be between ${min} and ${max}` }, { status: 400 })
  }
  return raw
}

function readBoolean(
  body: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean | NextResponse {
  const raw = body[key]
  if (raw === undefined) return fallback
  if (typeof raw !== 'boolean') {
    return NextResponse.json({ message: `${key} must be a boolean` }, { status: 400 })
  }
  return raw
}

function readStrategies(
  body: Record<string, unknown>,
  key: string,
): string[] | NextResponse {
  const raw = body[key]
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    return NextResponse.json({ message: `${key} must be an array` }, { status: 400 })
  }
  const values = Array.from(new Set(raw))
  if (values.some((value) => typeof value !== 'string' || !CONFIG_STRATEGIES.includes(value as any))) {
    return NextResponse.json({ message: `${key} contains an unsupported strategy` }, { status: 400 })
  }
  return values as string[]
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  const config = await loadLearningConfig(store.id)
  const resolved = config ?? learningConfigDefaults()
  const mode = !resolved.enabled ? 'baseline' : resolved.shadowMode ? 'shadow' : 'active'

  let stats: any[] = []
  let totalEvents = 0
  let totalOutcomes = 0
  let agents: Array<{
    source: string
    events: number
    outcomes: number
    reward: number
    purchaseValue: number
  }> = []
  try {
    const [rows, eventCount, outcomeCount, eventGroups, outcomeGroups] = await Promise.all([
      (prisma as any).bargainLearningArmStat?.findMany({
        where: { storeId: store.id },
        orderBy: [{ environment: 'asc' }, { contextKey: 'asc' }, { strategy: 'asc' }],
        take: 250,
      }) ?? Promise.resolve([]),
      (prisma as any).bargainLearningEvent?.count({ where: { storeId: store.id } }) ?? Promise.resolve(0),
      (prisma as any).bargainLearningOutcome?.count({ where: { storeId: store.id } }) ?? Promise.resolve(0),
      (prisma as any).bargainLearningEvent?.groupBy?.({
        by: ['agentSource'],
        where: { storeId: store.id },
        _count: { _all: true },
      }) ?? Promise.resolve([]),
      (prisma as any).bargainLearningOutcome?.groupBy?.({
        by: ['agentSource'],
        where: { storeId: store.id },
        _count: { _all: true },
        _sum: { reward: true, purchaseValue: true },
      }) ?? Promise.resolve([]),
    ])
    stats = Array.isArray(rows) ? rows : []
    totalEvents = Number(eventCount) || 0
    totalOutcomes = Number(outcomeCount) || 0
    const bySource = new Map<string, { source: string; events: number; outcomes: number; reward: number; purchaseValue: number }>()
    for (const row of Array.isArray(eventGroups) ? eventGroups : []) {
      const source = typeof row.agentSource === 'string' ? row.agentSource : 'unattributed'
      bySource.set(source, {
        source,
        events: Number(row._count?._all) || 0,
        outcomes: 0,
        reward: 0,
        purchaseValue: 0,
      })
    }
    for (const row of Array.isArray(outcomeGroups) ? outcomeGroups : []) {
      const source = typeof row.agentSource === 'string' ? row.agentSource : 'unattributed'
      const current = bySource.get(source) ?? { source, events: 0, outcomes: 0, reward: 0, purchaseValue: 0 }
      current.outcomes = Number(row._count?._all) || 0
      current.reward = Number(row._sum?.reward) || 0
      current.purchaseValue = Number(row._sum?.purchaseValue) || 0
      bySource.set(source, current)
    }
    agents = Array.from(bySource.values()).sort((a, b) => b.events - a.events || b.outcomes - a.outcomes)
  } catch (error) {
    console.warn('[bargain-learning] summary read failed:', error)
  }

  return NextResponse.json({
    configured: Boolean(config),
    mode,
    ...resolved,
    totalEvents,
    totalOutcomes,
    agents,
    stats,
    strategies: CONFIG_STRATEGIES,
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid')
  } catch {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 })
  }

  const current = (await loadLearningConfig(store.id)) ?? learningConfigDefaults()
  const numbers = {
    explorationRate: readNumber(body, 'explorationRate', current.explorationRate, 0, 0.5),
    minSamplesPerArm: readNumber(body, 'minSamplesPerArm', current.minSamplesPerArm, 1, 10000),
    attributionWindowDays: readNumber(body, 'attributionWindowDays', current.attributionWindowDays, 1, 30),
    eventRetentionDays: readNumber(body, 'eventRetentionDays', current.eventRetentionDays, 7, 730),
    rewardConversion: readNumber(body, 'rewardConversion', current.rewardConversion, 0, 1),
    rewardMargin: readNumber(body, 'rewardMargin', current.rewardMargin, 0, 1),
    rewardExperience: readNumber(body, 'rewardExperience', current.rewardExperience, 0, 1),
    rewardEfficiency: readNumber(body, 'rewardEfficiency', current.rewardEfficiency, 0, 1),
  }
  for (const value of Object.values(numbers)) {
    if (value instanceof NextResponse) return value
  }

  const booleans = {
    enabled: readBoolean(body, 'enabled', current.enabled),
    shadowMode: readBoolean(body, 'shadowMode', current.shadowMode),
    demoEnabled: readBoolean(body, 'demoEnabled', current.demoEnabled),
    promoStrategyEnabled: readBoolean(body, 'promoStrategyEnabled', current.promoStrategyEnabled),
  }
  for (const value of Object.values(booleans)) {
    if (value instanceof NextResponse) return value
  }

  const allowedStrategies = readStrategies(body, 'allowedStrategies')
  if (allowedStrategies instanceof NextResponse) return allowedStrategies
  const blockedStrategies = readStrategies(body, 'blockedStrategies')
  if (blockedStrategies instanceof NextResponse) return blockedStrategies

  const versionRaw = body.version
  if (
    versionRaw !== undefined &&
    (typeof versionRaw !== 'string' || !/^[a-zA-Z0-9._-]{1,32}$/.test(versionRaw))
  ) {
    return NextResponse.json(
      { message: 'version must be 1-32 letters, numbers, dots, dashes or underscores' },
      { status: 400 },
    )
  }

  const weights = [
    numbers.rewardConversion,
    numbers.rewardMargin,
    numbers.rewardExperience,
    numbers.rewardEfficiency,
  ] as number[]
  if (weights.every((weight) => weight === 0)) {
    return NextResponse.json({ message: 'At least one reward weight must be greater than zero' }, { status: 400 })
  }

  const data = {
    enabled: booleans.enabled as boolean,
    shadowMode: booleans.shadowMode as boolean,
    demoEnabled: booleans.demoEnabled as boolean,
    version: (versionRaw as string | undefined) ?? current.version,
    explorationRate: numbers.explorationRate as number,
    minSamplesPerArm: Math.round(numbers.minSamplesPerArm as number),
    attributionWindowDays: Math.round(numbers.attributionWindowDays as number),
    eventRetentionDays: Math.round(numbers.eventRetentionDays as number),
    rewardConversion: numbers.rewardConversion as number,
    rewardMargin: numbers.rewardMargin as number,
    rewardExperience: numbers.rewardExperience as number,
    rewardEfficiency: numbers.rewardEfficiency as number,
    allowedStrategies,
    blockedStrategies,
    promoStrategyEnabled: booleans.promoStrategyEnabled as boolean,
  }

  const saved = await prisma.bargainLearningConfig.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id, ...data },
    update: data,
  })

  await (prisma as any).bargainLearningAudit?.create?.({
    data: {
      storeId: store.id,
      actorType: 'merchant',
      actorId: session.user.id,
      action: current.enabled === data.enabled ? 'update' : data.enabled ? 'enable' : 'disable',
      resourceType: 'bargain_learning_config',
      resourceId: saved.id,
      before: current as any,
      after: data as any,
    },
  }).catch(() => null)

  console.info('[bargain-learning] config updated', {
    storeId: store.id,
    enabled: data.enabled,
    mode: !data.enabled ? 'baseline' : data.shadowMode ? 'shadow' : 'active',
  })

  return NextResponse.json({ configured: true, ...data })
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  await prisma.bargainLearningConfig.deleteMany({ where: { storeId: store.id } })
  return NextResponse.json({ configured: false, ...learningConfigDefaults() })
}
