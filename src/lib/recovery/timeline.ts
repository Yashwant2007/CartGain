/**
 * Pure builder for the merchant-facing recovery timeline.
 *
 * The dashboard shows, for one cart, the full planned sequence (channels ×
 * rounds) merged with what actually happened: which step is next, which were
 * sent/delivered, and — crucially — why a step was skipped or the whole
 * sequence stopped. Keeping this pure makes the timeline testable without a DB
 * and guarantees the UI and the sweep read the same sequence + stop rules.
 */
import {
  buildRecoverySequence,
  resolveNextStep,
  evaluateCampaignStop,
  sanitizeChannels,
  clampRounds,
  type CampaignSequenceConfig,
  type CampaignStopReason,
  type RecoveryIdentityLike,
} from '@/lib/recovery/sequence'

export type TimelineMessage = {
  channel: string
  step: number | null
  status: string
  reasonCode?: string | null
  sentAt?: Date | string | null
  deliveredAt?: Date | string | null
  clickedAt?: Date | string | null
  attempts?: number | null
  createdAt?: Date | string | null
}

export type TimelineCart = {
  abandonedAt: Date | string
  convertedAt?: Date | string | null
  isRecovered?: boolean | null
}

export type TimelineStatus =
  | 'scheduled'
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'skipped'
  | 'failed'

export type TimelineStep = {
  index: number
  round: number
  channel: string
  scheduledAt: string
  status: TimelineStatus
  reasonCode: string | null
  sentAt: string | null
  deliveredAt: string | null
  clickedAt: string | null
  attempts: number
}

export type CartTimeline = {
  /** Index of the step the sweep will send next, or null when finished. */
  nextStepIndex: number | null
  stopReason: CampaignStopReason | null
  steps: TimelineStep[]
}

export type BuildTimelineInput = {
  cart: TimelineCart
  messages: TimelineMessage[]
  campaign?: CampaignSequenceConfig | null
  identity?: RecoveryIdentityLike | null
  now?: Date
  expiryDays?: number
}

const DEFAULT_CAMPAIGN: CampaignSequenceConfig = {
  channels: ['email', 'whatsapp'],
  maxFollowUps: 1,
  sendDelay: 0,
  followUpDelay: 30,
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function toStatus(value: string | undefined): TimelineStatus {
  switch (value) {
    case 'sent':
    case 'delivered':
    case 'skipped':
    case 'failed':
    case 'pending':
      return value
    default:
      return 'pending'
  }
}

export function buildCartTimeline(input: BuildTimelineInput): CartTimeline {
  const now = input.now ?? new Date()
  const abandonedAt =
    input.cart.abandonedAt instanceof Date
      ? input.cart.abandonedAt
      : new Date(input.cart.abandonedAt)

  const campaign = input.campaign ?? DEFAULT_CAMPAIGN
  // Normalise so a corrupt campaign cannot produce a giant/empty timeline.
  const normalised: CampaignSequenceConfig = {
    ...campaign,
    channels: sanitizeChannels(campaign.channels),
    maxFollowUps: clampRounds(campaign.maxFollowUps),
  }
  const sequence = buildRecoverySequence(normalised, abandonedAt)

  const byKey = new Map<string, TimelineMessage>()
  for (const message of input.messages) {
    if (message.step === null || message.step === undefined) continue
    byKey.set(`${message.channel}:${message.step}`, message)
  }

  const steps: TimelineStep[] = sequence.map((scheduled) => {
    const message = byKey.get(`${scheduled.channel}:${scheduled.index}`)
    const due = now.getTime() >= scheduled.scheduledAt.getTime()
    return {
      index: scheduled.index,
      round: scheduled.round,
      channel: scheduled.channel,
      scheduledAt: scheduled.scheduledAt.toISOString(),
      status: message ? toStatus(message.status) : due ? 'pending' : 'scheduled',
      reasonCode: message?.reasonCode ?? null,
      sentAt: toIso(message?.sentAt),
      deliveredAt: toIso(message?.deliveredAt),
      clickedAt: toIso(message?.clickedAt),
      attempts: Number(message?.attempts) || 0,
    }
  })

  // Legacy rows can carry a step index outside the current plan (e.g. the
  // merchant shortened the campaign). Keep them so the history is never lost.
  const plannedKeys = new Set(sequence.map((s) => `${s.channel}:${s.index}`))
  for (const message of input.messages) {
    if (message.step === null || message.step === undefined) continue
    const key = `${message.channel}:${message.step}`
    if (plannedKeys.has(key)) continue
    plannedKeys.add(key)
    steps.push({
      index: message.step,
      round: 0,
      channel: message.channel,
      scheduledAt: toIso(message.createdAt) ?? now.toISOString(),
      status: toStatus(message.status),
      reasonCode: message.reasonCode ?? null,
      sentAt: toIso(message.sentAt),
      deliveredAt: toIso(message.deliveredAt),
      clickedAt: toIso(message.clickedAt),
      attempts: Number(message.attempts) || 0,
    })
  }

  const next = resolveNextStep(sequence, input.messages)
  const stopReason = evaluateCampaignStop({
    cart: input.cart,
    identity: input.identity ?? null,
    next,
    abandonedAt,
    now,
    expiryDays: input.expiryDays,
  })

  return {
    nextStepIndex: stopReason || next.done ? null : next.step.index,
    stopReason,
    steps,
  }
}
