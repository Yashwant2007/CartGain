import {
  windowState,
  campaignActiveAt,
  toBusinessDay,
  goalBusinessDate,
  evaluatePacing,
  elapsedPercent,
  buildGoalContextForNegotiation,
  getGoalStatus,
  attributeBargainGoal,
  netBargainGoalRefund,
  clampOfferToSafety,
  strategyAdjustedCounter,
  type GoalConfigLike,
} from '../goals'
import prismaImport from '@/lib/db'
import type { NegotiationContext } from '../engine'

jest.mock('@/lib/db', () => {
  const m = {
    bargainConfig: { findUnique: jest.fn() },
    bargainSession: { findFirst: jest.fn() },
    bargainDailyGoal: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    bargainDailyGoalIncrement: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  }
  return { __esModule: true, default: m, prisma: m }
})

const mockPrisma: any = prismaImport

const now = new Date('2026-09-12T10:00:00.000Z')

function makeConfig(over: Partial<GoalConfigLike> = {}): GoalConfigLike {
  return {
    goalEnabled: true,
    goalType: 'orders',
    goalTarget: 10,
    goalStartTime: new Date('2026-09-12T08:00:00.000Z'),
    goalEndTime: new Date('2026-09-12T12:00:00.000Z'),
    goalTimezone: 'UTC',
    dynamicStrategyEnabled: true,
    campaignName: null,
    campaignMessage: null,
    campaignStart: null,
    campaignEnd: null,
    ...over,
  }
}

const baseCtx = (over: Partial<NegotiationContext> = {}): NegotiationContext => ({
  storeName: 'Test Store',
  currencySymbol: '₹',
  originalPrice: 1000,
  minPrice: 800,
  attemptsUsed: 0,
  maxAttempts: 3,
  persona: 'friendly_shopkeeper',
  ...over,
})

// ════════════════════════════════════════════════════════════
// Window state
// ════════════════════════════════════════════════════════════
describe('windowState', () => {
  it('is disabled when goal is not enabled', () => {
    expect(windowState(makeConfig({ goalEnabled: false }), now)).toBe('disabled')
  })

  it('is disabled when window times are missing or inverted', () => {
    expect(windowState(makeConfig({ goalStartTime: null }), now)).toBe('disabled')
    expect(windowState(makeConfig({ goalEndTime: null }), now)).toBe('disabled')
    expect(
      windowState(
        makeConfig({
          goalStartTime: new Date('2026-09-12T12:00:00Z'),
          goalEndTime: new Date('2026-09-12T08:00:00Z'),
        }),
        now,
      ),
    ).toBe('disabled')
  })

  it('is not_started before the window, active inside, ended after', () => {
    expect(windowState(makeConfig(), new Date('2026-09-12T07:59:59Z'))).toBe('not_started')
    expect(windowState(makeConfig(), new Date('2026-09-12T08:00:01Z'))).toBe('active')
    expect(windowState(makeConfig(), new Date('2026-09-12T12:00:01Z'))).toBe('ended')
  })
})

// ════════════════════════════════════════════════════════════
// Campaign window gating (§9/§10/§28 — never feed an inactive campaign)
// ════════════════════════════════════════════════════════════
describe('campaignActiveAt', () => {
  it('an unbounded campaign is active for the whole goal window', () => {
    expect(campaignActiveAt(makeConfig(), now)).toBe(true)
  })

  it('is active only inside the configured campaign window', () => {
    const cfg = makeConfig({
      campaignStart: new Date('2026-09-12T09:00:00Z'),
      campaignEnd: new Date('2026-09-12T11:00:00Z'),
    })
    expect(campaignActiveAt(cfg, new Date('2026-09-12T08:30:00Z'))).toBe(false)
    expect(campaignActiveAt(cfg, new Date('2026-09-12T09:30:00Z'))).toBe(true)
    expect(campaignActiveAt(cfg, new Date('2026-09-12T11:30:00Z'))).toBe(false)
  })

  it('is false when only one bound is set or the window is inverted', () => {
    const partial = makeConfig({ campaignStart: new Date('2026-09-12T09:00:00Z'), campaignEnd: null })
    expect(campaignActiveAt(partial, now)).toBe(false)
    const inverted = makeConfig({
      campaignStart: new Date('2026-09-12T11:00:00Z'),
      campaignEnd: new Date('2026-09-12T09:00:00Z'),
    })
    expect(campaignActiveAt(inverted, now)).toBe(false)
  })

  it('is false when the goal window is not active', () => {
    expect(campaignActiveAt(makeConfig(), new Date('2026-09-12T07:00:00Z'))).toBe(false)
    expect(campaignActiveAt(makeConfig(), new Date('2026-09-12T13:00:00Z'))).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// Business-day bucket identity (timezone aware)
// ════════════════════════════════════════════════════════════
describe('business-day buckets', () => {
  it('labels a UTC instant by the merchant-local calendar day', () => {
    expect(toBusinessDay(new Date('2026-09-12T18:30:00Z'), 'Asia/Kolkata')).toBe('2026-09-13')
    expect(toBusinessDay(new Date('2026-09-12T18:30:00Z'), 'UTC')).toBe('2026-09-12')
    expect(toBusinessDay(new Date('2026-09-12T10:00:00Z'), 'America/New_York')).toBe('2026-09-12')
  })

  it('falls back to UTC for an invalid timezone', () => {
    expect(toBusinessDay(new Date('2026-09-12T10:00:00Z'), 'Mars/Olympus')).toBe('2026-09-12')
  })

  it('derives the goal bucket from goalStartTime', () => {
    expect(goalBusinessDate(makeConfig(), 'UTC')).toBe('2026-09-12')
  })
})

// ════════════════════════════════════════════════════════════
// Evaluate pacing → strategy
// ════════════════════════════════════════════════════════════
describe('evaluatePacing', () => {
  it('returns NORMAL / idle for a disabled or out-of-window goal', () => {
    const disabled = evaluatePacing(makeConfig({ goalEnabled: false }), { achievedValue: 5, orderCount: 5 }, now)
    expect(disabled).toMatchObject({ strategy: 'NORMAL', mode: 'idle', progressPercent: 0, elapsedPercent: 0 })

    const before = evaluatePacing(makeConfig(), { achievedValue: 5, orderCount: 5 }, new Date('2026-09-12T07:00:00Z'))
    expect(before.mode).toBe('idle')
    expect(before.elapsedPercent).toBe(0)

    const after = evaluatePacing(makeConfig(), { achievedValue: 5, orderCount: 5 }, new Date('2026-09-12T13:00:00Z'))
    expect(after.mode).toBe('idle')
    expect(after.elapsedPercent).toBe(100)
  })

  it('computes progress and elapsed percentages at the midpoint', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 5, orderCount: 5 }, now)
    expect(r.elapsedPercent).toBe(50)
    expect(r.progressPercent).toBe(50)
    expect(r.targetAtNow).toBeCloseTo(5, 6)
  })

  it('marks on_track around a pace ratio of 1', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 5, orderCount: 5 }, now)
    expect(r.mode).toBe('on_track')
    expect(r.strategy).toBe('NORMAL')
  })

  it('marks ahead when ahead of pace', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 7, orderCount: 7 }, now)
    expect(r.mode).toBe('ahead')
  })

  it('marks behind when behind pace', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 3, orderCount: 3 }, now)
    expect(r.mode).toBe('behind')
  })

  it('switches to CLOSING near the end of the window when not ahead', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 4.75, orderCount: 5 }, new Date('2026-09-12T11:48:00Z'))
    expect(r.mode).toBe('behind')
    expect(r.strategy).toBe('CLOSING')
  })

  it('does not switch to CLOSING when already ahead', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 10, orderCount: 10 }, new Date('2026-09-12T11:48:00Z'))
    expect(r.mode).toBe('ahead')
    expect(r.strategy).toBe('NORMAL')
  })

  it('switches to AGGRESSIVE when badly behind', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 1.5, orderCount: 2 }, now)
    expect(r.paceRatio).toBeLessThan(0.75)
    expect(r.strategy).toBe('AGGRESSIVE')
  })

  it('switches to CONSERVATIVE when far ahead', () => {
    const r = evaluatePacing(makeConfig(), { achievedValue: 9, orderCount: 9 }, now)
    expect(r.paceRatio).toBeGreaterThan(1.3)
    expect(r.strategy).toBe('CONSERVATIVE')
  })

  it('stays NORMAL when dynamic strategy is disabled', () => {
    const cfg = makeConfig({ dynamicStrategyEnabled: false })
    expect(evaluatePacing(cfg, { achievedValue: 1.5, orderCount: 2 }, now).strategy).toBe('NORMAL')
    expect(evaluatePacing(cfg, { achievedValue: 9, orderCount: 9 }, now).strategy).toBe('NORMAL')
  })

  it('handles a zero target without division-by-zero', () => {
    const r = evaluatePacing(makeConfig({ goalTarget: 0 }), { achievedValue: 0, orderCount: 0 }, now)
    expect(r.progressPercent).toBe(0)
    expect(r.strategy).toBe('NORMAL')
  })

  it('paces an orders goal by confirmed count, not by order value', () => {
    // 2 orders summing to a large order value should NOT count as 80% of a
    // 10-order target — the count is the metric.
    const r = evaluatePacing(
      makeConfig({ goalType: 'orders', goalTarget: 10 }),
      { achievedValue: 8000, orderCount: 2 },
      now,
    )
    expect(r.progressPercent).toBe(20)
    expect(r.paceRatio).toBeCloseTo(0.4, 6)
    expect(r.strategy).toBe('AGGRESSIVE')
  })

  it('paces a revenue goal by recognized value', () => {
    const r = evaluatePacing(
      makeConfig({ goalType: 'revenue', goalTarget: 1000 }),
      { achievedValue: 500, orderCount: 99 },
      now,
    )
    expect(r.progressPercent).toBe(50)
    expect(r.paceRatio).toBeCloseTo(1, 6)
    expect(r.mode).toBe('on_track')
  })
})

describe('elapsedPercent', () => {
  it('is 0 before the window and 100 after it', () => {
    expect(elapsedPercent(makeConfig(), new Date('2026-09-12T07:00:00Z'))).toBe(0)
    expect(elapsedPercent(makeConfig(), new Date('2026-09-12T13:00:00Z'))).toBe(100)
    expect(elapsedPercent(makeConfig(), now)).toBe(50)
  })
})

// ════════════════════════════════════════════════════════════
// Strategy-aware counter + final safety validator
// ════════════════════════════════════════════════════════════
describe('strategyAdjustedCounter', () => {
  const ctx = baseCtx({ originalPrice: 1000, minPrice: 800 })

  it('keeps NORMAL unchanged', () => {
    expect(strategyAdjustedCounter(ctx, 'NORMAL', 900)).toBe(900)
  })

  it('CONSERVATIVE pushes up by 25% of the range', () => {
    expect(strategyAdjustedCounter(ctx, 'CONSERVATIVE', 900)).toBe(950)
  })

  it('AGGRESSIVE pushes down by 12% of the range', () => {
    expect(strategyAdjustedCounter(ctx, 'AGGRESSIVE', 900)).toBe(876)
  })

  it('CLOSING pushes down by 30% of the range', () => {
    expect(strategyAdjustedCounter(ctx, 'CLOSING', 900)).toBe(840)
  })

  it('never breaches the floor even when nudged hard', () => {
    expect(strategyAdjustedCounter(ctx, 'CLOSING', 800)).toBe(800)
    expect(strategyAdjustedCounter(ctx, 'AGGRESSIVE', 850)).toBe(826)
  })

  it('clamps to the original price when pushed up beyond it', () => {
    expect(strategyAdjustedCounter(ctx, 'CONSERVATIVE', 1000)).toBe(1000)
  })

  it('returns the floor when there is no negotiable range', () => {
    const flat = baseCtx({ originalPrice: 800, minPrice: 800 })
    expect(strategyAdjustedCounter(flat, 'CLOSING', 900)).toBe(800)
  })
})

describe('clampOfferToSafety', () => {
  const safe = (suggested: number) => clampOfferToSafety({ originalPrice: 1000, minPrice: 800, suggested })

  it('clamps below-the-floor suggestions to the floor', () => {
    expect(safe(799)).toBe(800)
    expect(safe(0)).toBe(800)
  })

  it('clamps above-list suggestions to the list price', () => {
    expect(safe(1500)).toBe(1000)
  })

  it('rounds to 2 decimals', () => {
    expect(safe(823.456)).toBe(823.46)
  })

  it('falls back to the floor for NaN / negative suggestions', () => {
    expect(safe(NaN)).toBe(800)
    expect(safe(-5)).toBe(800)
  })
})

// ════════════════════════════════════════════════════════════
// Negotiation goal context & status (mocked db)
// ════════════════════════════════════════════════════════════
const activeConfig = makeConfig({
  goalType: 'revenue',
  goalTarget: 100000,
  campaignName: 'Monsoon',
  campaignMessage: 'Best prices all weekend',
})

describe('buildGoalContextForNegotiation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns undefined when the goal window is not active', async () => {
    const ctx = await buildGoalContextForNegotiation(
      { ...makeConfig({ goalEnabled: false }), storeId: 'store_1' } as any,
      'UTC',
      now,
    )
    expect(ctx).toBeUndefined()
    expect(mockPrisma.bargainDailyGoal.findUnique).not.toHaveBeenCalled()
  })

  it('returns context with strategy, campaign and closesAt for an active window', async () => {
    mockPrisma.bargainDailyGoal.findUnique.mockResolvedValue({ achievedValue: 20000, orderCount: 4 })
    const ctx = await buildGoalContextForNegotiation({ ...activeConfig, storeId: 'store_1' } as any, 'UTC', now)
    expect(ctx).toMatchObject({
      goalType: 'revenue',
      strategy: 'AGGRESSIVE',
      mode: 'behind',
      campaignName: 'Monsoon',
      campaignMessage: 'Best prices all weekend',
      closesAt: activeConfig.goalEndTime!.toISOString(),
    })
  })

  it('treats a missing daily row as zero progress instead of failing', async () => {
    mockPrisma.bargainDailyGoal.findUnique.mockResolvedValue(null)
    const ctx = await buildGoalContextForNegotiation({ ...makeConfig(), storeId: 'store_1' } as any, 'UTC', now)
    expect(ctx).toBeDefined()
    expect(ctx?.mode).toBe('behind')
    expect(ctx?.strategy).toBe('AGGRESSIVE')
  })

  it('never leaks an inactive/expired campaign to the AI', async () => {
    mockPrisma.bargainDailyGoal.findUnique.mockResolvedValue({ achievedValue: 0, orderCount: 0 })
    const cfg = {
      ...activeConfig,
      storeId: 'store_1',
      campaignStart: new Date('2026-09-12T11:00:00Z'),
      campaignEnd: new Date('2026-09-12T11:30:00Z'),
    } as any
    const ctx = await buildGoalContextForNegotiation(cfg, 'UTC', now)
    expect(ctx?.campaignName).toBeUndefined()
    expect(ctx?.campaignMessage).toBeUndefined()
    expect(ctx?.strategy).toBeDefined()
  })
})

describe('getGoalStatus', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates the daily row on read and reports status', async () => {
    mockPrisma.bargainDailyGoal.upsert.mockResolvedValue({
      storeId: 'store_1',
      businessDate: '2026-09-12',
      goalType: 'revenue',
      targetValue: 100000,
      achievedValue: 25000,
      orderCount: 5,
    })
    const status = await getGoalStatus({ id: 'store_1', timezone: 'UTC' }, activeConfig, now)
    expect(status.enabled).toBe(true)
    expect(status.windowState).toBe('active')
    expect(status.goalType).toBe('revenue')
    expect(status.businessDate).toBe('2026-09-12')
    expect(status.strategy).toBe('AGGRESSIVE')
    expect(status.mode).toBe('behind')
    expect(status.progressPercent).toBe(25)
    expect(status.campaignName).toBe('Monsoon')
    expect(status.startsAtISO).toBe(activeConfig.goalStartTime!.toISOString())
    expect(status.closesAtISO).toBe(activeConfig.goalEndTime!.toISOString())
  })

  it('reports NORMAL/idle outside the window', async () => {
    mockPrisma.bargainDailyGoal.upsert.mockResolvedValue({
      businessDate: '2026-09-12',
      goalType: 'orders',
      targetValue: 10,
      achievedValue: 5,
      orderCount: 5,
    })
    const status = await getGoalStatus(
      { id: 'store_1', timezone: 'UTC' },
      activeConfig,
      new Date('2026-09-12T06:00:00Z'),
    )
    expect(status.windowState).toBe('not_started')
    expect(status.strategy).toBe('NORMAL')
    expect(status.mode).toBe('idle')
  })

  it('reports an ended bounded campaign as absent', async () => {
    mockPrisma.bargainDailyGoal.upsert.mockResolvedValue({
      storeId: 'store_1',
      businessDate: '2026-09-12',
      goalType: 'revenue',
      targetValue: 100000,
      achievedValue: 25000,
      orderCount: 5,
    })
    const status = await getGoalStatus(
      { id: 'store_1', timezone: 'UTC' },
      {
        ...activeConfig,
        campaignStart: new Date('2026-09-12T08:00:00Z'),
        campaignEnd: new Date('2026-09-12T09:00:00Z'),
      },
      now,
    )
    expect(status.campaignName).toBeNull()
    expect(status.campaignMessage).toBeNull()
    expect(status.windowState).toBe('active')
  })
})

// ════════════════════════════════════════════════════════════
// Attribution & netting (single source of truth = the ledger)
// ════════════════════════════════════════════════════════════
describe('attributeBargainGoal', () => {
  const store = { id: 'store_1', timezone: 'UTC' }

  beforeEach(() => jest.clearAllMocks())

  it('ignores orders with no id or negative amounts', async () => {
    expect(await attributeBargainGoal({ store, shopifyOrderId: '', orderAmount: 100, orderCreatedAt: now })).toBe(false)
    expect(await attributeBargainGoal({ store, shopifyOrderId: 'o1', orderAmount: -5, orderCreatedAt: now })).toBe(false)
  })

  it('returns false (skipped) when no bargain config exists', async () => {
    mockPrisma.bargainConfig.findUnique.mockResolvedValue(null)
    expect(await attributeBargainGoal({ store, shopifyOrderId: 'o1', orderAmount: 100, orderCreatedAt: now })).toBe(false)
  })

  it('skips when the order falls outside an active window', async () => {
    mockPrisma.bargainConfig.findUnique.mockResolvedValue(
      makeConfig({ goalStartTime: new Date('2026-09-12T12:00:00Z') }),
    )
    expect(await attributeBargainGoal({ store, shopifyOrderId: 'o1', orderAmount: 100, orderCreatedAt: now })).toBe(false)
  })

  it('matches via the applied discount code and credits the daily goal inside a transaction', async () => {
    mockPrisma.bargainConfig.findUnique.mockResolvedValue(makeConfig())
    mockPrisma.bargainSession.findFirst.mockResolvedValue({ id: 'sess_1' })
    mockPrisma.bargainDailyGoal.upsert.mockResolvedValue({ businessDate: '2026-09-12' })

    const tx = {
      bargainDailyGoalIncrement: { create: jest.fn().mockResolvedValue({}) },
      bargainDailyGoal: { update: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx))

    const ok = await attributeBargainGoal({
      store,
      shopifyOrderId: 'o1',
      orderAmount: 1234.567,
      orderCreatedAt: now,
      appliedCodes: ['WELCOME10'],
      email: 'buyer@example.com',
      cartToken: 'cart_xyz',
    })
    expect(ok).toBe(true)

    const ors = mockPrisma.bargainSession.findFirst.mock.calls[0][0].where.OR
    expect(ors).toEqual(
      expect.arrayContaining([
        { discountCodeCustomerEmail: 'buyer@example.com' },
        { discountCodeCartToken: 'cart_xyz' },
        { discountCode: 'WELCOME10' },
      ]),
    )

    expect(tx.bargainDailyGoalIncrement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: 'store_1', shopifyOrderId: 'o1', orderAmount: 1234.57 }),
    })
    expect(tx.bargainDailyGoal.update).toHaveBeenCalledWith({
      where: { storeId_businessDate: { storeId: 'store_1', businessDate: '2026-09-12' } },
      data: { achievedValue: { increment: 1234.57 }, orderCount: { increment: 1 } },
    })
  })

  it('does not double-credit a duplicate webhook (P2002)', async () => {
    mockPrisma.bargainConfig.findUnique.mockResolvedValue(makeConfig())
    mockPrisma.bargainSession.findFirst.mockResolvedValue({ id: 'sess_1' })
    mockPrisma.bargainDailyGoal.upsert.mockResolvedValue({ businessDate: '2026-09-12' })

    const tx = {
      bargainDailyGoalIncrement: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
      bargainDailyGoal: { update: jest.fn() },
    }
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx))

    const ok = await attributeBargainGoal({ store, shopifyOrderId: 'o1', orderAmount: 100, orderCreatedAt: now })
    expect(ok).toBe(false)
    expect(tx.bargainDailyGoal.update).not.toHaveBeenCalled()
  })
})

describe('netBargainGoalRefund', () => {
  beforeEach(() => jest.clearAllMocks())

  it('no-ops when there is no increment for the order', async () => {
    mockPrisma.bargainDailyGoalIncrement.findUnique.mockResolvedValue(null)
    await netBargainGoalRefund({ storeId: 'store_1', shopifyOrderId: 'o1', refundAmount: 0, fullyRefunded: true })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('fully refunded orders drop out of both value and count', async () => {
    mockPrisma.bargainDailyGoalIncrement.findUnique.mockResolvedValue({
      storeId: 'store_1',
      businessDate: '2026-09-12',
      orderAmount: 1000,
      refundedAmount: 0,
    })

    const tx = {
      bargainDailyGoalIncrement: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          { orderAmount: 1000, refundedAmount: 1000 },
          { orderAmount: 500, refundedAmount: 0 },
          { orderAmount: 700, refundedAmount: 300 },
        ]),
      },
      bargainDailyGoal: { update: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx))

    await netBargainGoalRefund({ storeId: 'store_1', shopifyOrderId: 'o1', refundAmount: 0, fullyRefunded: true })

    expect(tx.bargainDailyGoalIncrement.update).toHaveBeenCalledWith({
      where: { shopifyOrderId: 'o1' },
      data: { refundedAmount: 1000 },
    })
    // achieved = 0 + 500 + (700-300) = 900; confirmed = 2 (fully refunded order dropped)
    expect(tx.bargainDailyGoal.update).toHaveBeenCalledWith({
      where: { storeId_businessDate: { storeId: 'store_1', businessDate: '2026-09-12' } },
      data: { achievedValue: 900, orderCount: 2 },
    })
  })

  it('partial refunds reduce value but keep the order counted', async () => {
    mockPrisma.bargainDailyGoalIncrement.findUnique.mockResolvedValue({
      storeId: 'store_1',
      businessDate: '2026-09-12',
      orderAmount: 1000,
      refundedAmount: 0,
    })

    const tx = {
      bargainDailyGoalIncrement: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ orderAmount: 1000, refundedAmount: 250 }]),
      },
      bargainDailyGoal: { update: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx))

    await netBargainGoalRefund({ storeId: 'store_1', shopifyOrderId: 'o1', refundAmount: 250, fullyRefunded: false })

    expect(tx.bargainDailyGoalIncrement.update).toHaveBeenCalledWith({
      where: { shopifyOrderId: 'o1' },
      data: { refundedAmount: 250 },
    })
    expect(tx.bargainDailyGoal.update).toHaveBeenCalledWith({
      where: { storeId_businessDate: { storeId: 'store_1', businessDate: '2026-09-12' } },
      data: { achievedValue: 750, orderCount: 1 },
    })
  })
})