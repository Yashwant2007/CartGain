// AI Salesperson — daily goal ledger, deterministic pacing and strategy selection.
//
// Ownership model (per the product brief):
//   Merchant defines the rules (target, window, campaign) → CartGain observes
//   (orders attributed via webhooks, idempotent per shopifyOrderId) → the
//   deterministic pacing layer selects a strategy → the AI negotiates WITHIN
//   the merchant's absolute floor → a final deterministic validator guarantees
//   no offer ever breaches the floor.
//
// This module is server-only (imports Prisma). The pure strategy/pricing math
// that must also be safe on the client lives in engine.ts (re-exported).
import prisma from '@/lib/db'
import { track } from '@/lib/analytics/track'
import {
  clampOfferToSafety,
  strategyAdjustedCounter,
  type BargainStrategy,
  type GoalMode,
  type NegotiationGoalContext,
} from '@/lib/bargain/engine'

export type GoalType = 'orders' | 'revenue'

// ── Window / pacing state ───────────────────────────────────────────────────

export type GoalWindowState = 'disabled' | 'not_started' | 'active' | 'ended'

export interface PacingResult {
  strategy: BargainStrategy
  mode: GoalMode
  progressPercent: number // achieved / target × 100
  elapsedPercent: number // window elapsed × 100 (0–100)
  paceRatio: number // achieved ÷ (target × elapsed) — >1 ahead, <1 behind
  targetAtNow: number // required units at this instant
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

const tzFmtCache = new Map<string, Intl.DateTimeFormat>()

function tzFmt(timeZone: string): Intl.DateTimeFormat {
  let f = tzFmtCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    tzFmtCache.set(timeZone, f)
  }
  return f
}

function safeTimezone(tz?: string | null): string {
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      return tz
    } catch {
      // fall through to UTC
    }
  }
  return 'UTC'
}

// Merchant-local calendar day label (YYYY-MM-DD) for `date`, viewed in `timeZone`.
// Used for goal bucket identity — attribution maps order creation to the goal's
// home business day (the merchant-local date of goalStartTime) so a window that
// crosses midnight still resolves to ONE goal row.
export function toBusinessDay(date: Date, timeZone: string): string {
  return tzFmt(safeTimezone(timeZone)).format(date)
}

// ── Structural config type (kept free of Prisma types for easy unit testing) ─

export interface GoalConfigLike {
  goalEnabled: boolean
  goalType: string
  goalTarget: number
  goalStartTime: Date | null
  goalEndTime: Date | null
  goalTimezone: string | null
  dynamicStrategyEnabled: boolean
  campaignName: string | null
  campaignMessage: string | null
  campaignStart: Date | null
  campaignEnd: Date | null
}

export function windowState(config: GoalConfigLike, now: Date): GoalWindowState {
  if (
    !config.goalEnabled ||
    !config.goalStartTime ||
    !config.goalEndTime ||
    config.goalStartTime >= config.goalEndTime
  ) {
    return 'disabled'
  }
  if (now < config.goalStartTime) return 'not_started'
  if (now > config.goalEndTime) return 'ended'
  return 'active'
}

// A campaign is only truthful while its configured window is active. An
// unconfigured campaign window means "runs for the whole goal window"; a
// half-configured or inverted window is treated as NOT active so we never feed
// an expired/false campaign to the AI (spec §9/§10/§28 "Campaign is active").
export function campaignActiveAt(config: GoalConfigLike, now: Date): boolean {
  if (windowState(config, now) !== 'active') return false
  const start = config.campaignStart
  const end = config.campaignEnd
  if (start == null && end == null) return true
  if (start == null || end == null) return false
  if (start >= end) return false
  return now >= start && now <= end
}

// The business date (merchant-local YYYY-MM-DD) the goal window belongs to.
export function goalBusinessDate(config: GoalConfigLike, timeZone: string): string {
  return toBusinessDay(config.goalStartTime ?? new Date(), timeZone)
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v || 0))

// Deterministic pacing → strategy. Pure, fully testable.
export function evaluatePacing(
  config: GoalConfigLike,
  opts: { achievedValue: number; orderCount: number },
  now: Date,
): PacingResult {
  const { goalTarget: target } = config
  const start = config.goalStartTime
  const end = config.goalEndTime
  // Compare against the metric the merchant actually set: an orders goal is
  // paced by confirmed order count, a revenue goal by recognized net value.
  const achieved = config.goalType === 'revenue' ? (opts.achievedValue || 0) : (opts.orderCount || 0)

  if (!config.goalEnabled || !start || !end || start >= end) {
    return {
      strategy: 'NORMAL',
      mode: 'idle',
      progressPercent: 0,
      elapsedPercent: 0,
      paceRatio: 1,
      targetAtNow: 0,
    }
  }

  const progressPercent = target > 0 ? (achieved / target) * 100 : 0
  if (now < start || now > end) {
    return {
      strategy: 'NORMAL',
      mode: 'idle',
      progressPercent,
      elapsedPercent: now < start ? 0 : 100,
      paceRatio: target > 0 ? achieved / target : 1,
      targetAtNow: target,
    }
  }

  const totalMs = Math.max(1, end.getTime() - start.getTime())
  const elapsedMs = Math.max(0, now.getTime() - start.getTime())
  const elapsedPercent = (clamp01(elapsedMs / totalMs)) * 100
  const targetAtNow = target * clamp01(elapsedMs / totalMs)
  const paceRatio = targetAtNow > 0 ? achieved / targetAtNow : 1

  let mode: GoalMode
  if (paceRatio > 1.05) mode = 'ahead'
  else if (paceRatio < 0.95) mode = 'behind'
  else mode = 'on_track'

  const remainingRatio = 1 - clamp01(elapsedMs / totalMs)

  let strategy: BargainStrategy = 'NORMAL'
  if (config.dynamicStrategyEnabled) {
    if (remainingRatio <= 0.15 && mode !== 'ahead') {
      strategy = 'CLOSING'
    } else if (mode === 'behind' && paceRatio < 0.75) {
      strategy = 'AGGRESSIVE'
    } else if (mode === 'ahead' && paceRatio > 1.3) {
      strategy = 'CONSERVATIVE'
    }
  }

  return { strategy, mode, progressPercent, elapsedPercent, paceRatio, targetAtNow }
}

// The fraction already elapsed (0–100) for display before/after the window.
export function elapsedPercent(config: GoalConfigLike, now: Date): number {
  const start = config.goalStartTime
  const end = config.goalEndTime
  if (!start || !end) return 0
  const total = Math.max(1, end.getTime() - start.getTime())
  return clamp01((now.getTime() - start.getTime()) / total) * 100
}

// ── Daily goal row: idempotent create-on-read / snapshot ────────────────────

async function ensureDailyGoal(config: GoalConfigLike, storeId: string, timeZone: string) {
  const businessDate = goalBusinessDate(config, timeZone)
  try {
    return await prisma.bargainDailyGoal.upsert({
      where: { storeId_businessDate: { storeId, businessDate } },
      create: {
        storeId,
        businessDate,
        goalType: config.goalType,
        targetValue: config.goalTarget,
      },
      // Re-snapshot on every read: a merchant who edits their target mid-day sees
      // the new number immediately (idempotent "goal reset"). Never zeroes the
      // accumulated achievedValue/orderCount.
      update: {
        goalType: config.goalType,
        targetValue: config.goalTarget,
      },
    })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      // Lost a create race — read the winner.
      return prisma.bargainDailyGoal.findUniqueOrThrow({
        where: { storeId_businessDate: { storeId, businessDate } },
      })
    }
    throw e
  }
}

// ── Negotiation context (no writes — cheap per-request read) ────────────────

export async function buildGoalContextForNegotiation(
  config: GoalConfigLike,
  storeTimezone: string | null,
  now: Date,
): Promise<NegotiationGoalContext | undefined> {
  if (windowState(config, now) !== 'active') return undefined

  const timezone = safeTimezone(config.goalTimezone ?? storeTimezone)
  const businessDate = goalBusinessDate(config, timezone)
  const row = await prisma.bargainDailyGoal.findUnique({
    where: { storeId_businessDate: { storeId: (config as any).storeId, businessDate } },
    select: { achievedValue: true, orderCount: true },
  })

  const pacing = evaluatePacing(
    config,
    { achievedValue: row?.achievedValue ?? 0, orderCount: row?.orderCount ?? 0 },
    now,
  )

  return {
    strategy: pacing.strategy,
    mode: pacing.mode,
    goalType: (config.goalType === 'revenue' ? 'revenue' : 'orders'),
    closesAt: config.goalEndTime!.toISOString(),
    // Only truthful campaign context (window active) reaches the AI.
    ...(campaignActiveAt(config, now) && config.campaignName ? { campaignName: config.campaignName } : {}),
    ...(campaignActiveAt(config, now) && config.campaignMessage ? { campaignMessage: config.campaignMessage } : {}),
  }
}

// ── Full assessment for the merchant status API / dashboard ────────────────

export interface GoalStatus {
  enabled: boolean
  windowState: GoalWindowState
  goalType: GoalType
  targetValue: number
  achievedValue: number
  orderCount: number
  businessDate: string
  timezone: string
  progressPercent: number
  elapsedPercent: number
  strategy: BargainStrategy
  mode: GoalMode
  startsAtISO: string | null
  closesAtISO: string | null
  campaignName: string | null
  campaignMessage: string | null
}

export async function getGoalStatus(
  store: { id: string; timezone: string | null },
  config: GoalConfigLike,
  now: Date,
): Promise<GoalStatus> {
  const timezone = safeTimezone(config.goalTimezone ?? store.timezone)
  const state = windowState(config, now)
  const start = config.goalStartTime
  const end = config.goalEndTime

  const row = await ensureDailyGoal(config, store.id, timezone)
  const pacing = evaluatePacing(
    config,
    { achievedValue: row.achievedValue, orderCount: row.orderCount },
    now,
  )

  return {
    enabled: state !== 'disabled',
    windowState: state,
    goalType: config.goalType === 'revenue' ? 'revenue' : 'orders',
    targetValue: row.targetValue,
    achievedValue: row.achievedValue,
    orderCount: row.orderCount,
    businessDate: row.businessDate,
    timezone,
    progressPercent: pacing.progressPercent,
    elapsedPercent: pacing.elapsedPercent,
    strategy: state === 'active' ? pacing.strategy : 'NORMAL',
    mode: state === 'active' ? pacing.mode : 'idle',
    startsAtISO: start ? start.toISOString() : null,
    closesAtISO: end ? end.toISOString() : null,
    // Active-only: an ended/scheduled/invalid campaign shows as absent so the
    // merchant dashboard never represents an expired or future sale as live.
    campaignName: campaignActiveAt(config, now) ? config.campaignName : null,
    campaignMessage: campaignActiveAt(config, now) ? config.campaignMessage : null,
  }
}

// ── Attribution: confirmed bargain orders → daily goal ──────────────────────
// Driven from the orders/create webhook. Idempotent: one BargainDailyGoalIncrement
// per shopifyOrderId (unique), so duplicate/retried webhooks never double-count.
export async function attributeBargainGoal(params: {
  store: { id: string; timezone: string | null }
  shopifyOrderId: string
  orderAmount: number // recognized net revenue (gross − all order discounts)
  orderCreatedAt: Date
  email?: string | null
  cartToken?: string | null
  checkoutToken?: string | null
  appliedCodes?: string[]
}): Promise<boolean> {
  const {
    store,
    shopifyOrderId,
    orderAmount,
    orderCreatedAt,
    email,
    cartToken,
    checkoutToken,
    appliedCodes,
  } = params

  if (!shopifyOrderId || orderAmount < 0) return false

  const config = await prisma.bargainConfig.findUnique({ where: { storeId: store.id } })
  if (!config) return false
  if (windowState(config, orderCreatedAt) !== 'active') return false

  const timezone = safeTimezone(config.goalTimezone ?? store.timezone)

  // Match the order to a bargain session whose issued discount code belongs to
  // this buyer/checkout. Strongest signal: the applied code itself; also the
  // checkout/cart token the code was bound to, and the bound email.
  const ors: any[] = []
  if (email) ors.push({ discountCodeCustomerEmail: email })
  if (cartToken) ors.push({ discountCodeCartToken: cartToken })
  if (checkoutToken) ors.push({ discountCodeCartToken: checkoutToken })
  if (Array.isArray(appliedCodes)) {
    for (const code of appliedCodes) {
      if (code) ors.push({ discountCode: code })
    }
  }
  if (ors.length === 0) return false

  const session = await prisma.bargainSession.findFirst({
    where: {
      storeId: store.id,
      status: 'accepted',
      discountCode: { not: null },
      OR: ors,
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (!session) return false

  const businessDate = goalBusinessDate(config, timezone)
  // Snapshot the row BEFORE crediting so we can detect the goal-crossing order.
  const goalRow = await ensureDailyGoal(config, store.id, timezone)
  const priorCount = goalRow?.orderCount ?? 0
  const priorValue = goalRow?.achievedValue ?? 0

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bargainDailyGoalIncrement.create({
        data: {
          storeId: store.id,
          businessDate,
          shopifyOrderId,
          goalType: config.goalType,
          orderAmount: Math.round(orderAmount * 100) / 100,
        },
      })
      await tx.bargainDailyGoal.update({
        where: { storeId_businessDate: { storeId: store.id, businessDate } },
        data: {
          achievedValue: { increment: Math.round(orderAmount * 100) / 100 },
          orderCount: { increment: 1 },
        },
      })
    })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      console.log(`Bargain goal: order ${shopifyOrderId} already attributed — skipping duplicate`)
      return false
    }
    throw e
  }

  // Spec §33 — log the attribution and, when this order crosses the target,
  // the completion. §36 — a purchase completed via a bargain code. Fire-and-
  // forget (never blocks or throws on the hot path).
  await track({ name: 'cartgain_purchase_completed', storeId: store.id, properties: {} })
  await track({
    name: 'cartgain_bargain_sale_attributed',
    storeId: store.id,
    properties: {
      goalType: config.goalType,
      orderAmount: Math.round(orderAmount * 100) / 100,
      businessDate,
      targetValue: config.goalTarget,
      achievedValue: Math.round((priorValue + orderAmount) * 100) / 100,
      orderCount: priorCount + 1,
    },
  })
  const goalCrossed =
    config.goalType === 'revenue'
      ? priorValue < config.goalTarget && priorValue + orderAmount >= config.goalTarget
      : priorCount < config.goalTarget && priorCount + 1 >= config.goalTarget
  if (goalCrossed) {
    await track({
      name: 'cartgain_daily_goal_completed',
      storeId: store.id,
      properties: {
        goalType: config.goalType,
        targetValue: config.goalTarget,
        businessDate,
        achievedValue: Math.round((priorValue + orderAmount) * 100) / 100,
        orderCount: priorCount + 1,
      },
    })
  }

  return true
}

// ── Refund / cancellation netting ───────────────────────────────────────────
// Recognized contribution per order is max(0, orderAmount − refundedAmount);
// a fully refunded order no longer counts toward the count goal. The daily row
// is recomputed from the ledger (single source of truth) so retries and partial
// refunds can never leave a stale total.
export async function netBargainGoalRefund(params: {
  storeId: string
  shopifyOrderId: string | null | undefined
  refundAmount: number
  fullyRefunded: boolean
}): Promise<void> {
  const { storeId, shopifyOrderId, refundAmount, fullyRefunded } = params
  if (!shopifyOrderId) return

  const inc = await prisma.bargainDailyGoalIncrement.findUnique({
    where: { shopifyOrderId },
  })
  if (!inc) return

  const nextRefunded = fullyRefunded
    ? inc.orderAmount
    : Math.max(inc.refundedAmount, inc.refundedAmount + refundAmount)

  await prisma.$transaction(async (tx) => {
    await tx.bargainDailyGoalIncrement.update({
      where: { shopifyOrderId },
      data: { refundedAmount: nextRefunded },
    })

    const rows = await tx.bargainDailyGoalIncrement.findMany({
      where: { storeId: inc.storeId, businessDate: inc.businessDate },
      select: { orderAmount: true, refundedAmount: true },
    })
    const achieved = rows.reduce(
      (sum, r) => sum + Math.max(0, r.orderAmount - (r.refundedAmount || 0)),
      0,
    )
    const confirmedOrders = rows.filter((r) => (r.refundedAmount || 0) < r.orderAmount - 1e-9).length

    await tx.bargainDailyGoal.update({
      where: { storeId_businessDate: { storeId: inc.storeId, businessDate: inc.businessDate } },
      data: { achievedValue: Math.round(achieved * 100) / 100, orderCount: confirmedOrders },
    })
  })

  console.log(
    `Bargain goal netted: order ${shopifyOrderId} ${fullyRefunded ? 'fully' : 'partially'} refunded ` +
    `(recognized contribution now ${Math.max(0, inc.orderAmount - nextRefunded).toFixed(2)})`,
  )
}

// ── Strategy-aware safe pricing helpers (server re-exports) ─────────────────
// Thin wrappers exposing the pure engine math under the goals module contract.

export { clampOfferToSafety, strategyAdjustedCounter }
export type { BargainStrategy, GoalMode }