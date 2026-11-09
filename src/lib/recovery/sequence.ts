// Deterministic campaign sequencing for abandoned-cart recovery.
//
// The recovery sweep used to treat a "step" as a round that hit EVERY reachable
// channel at once. That produced the two failures merchants reported: email and
// WhatsApp fired in the same sweep ("simultaneous messages"), and a channel
// that was added late could jump ahead of the merchant's configured order. The
// sequence here is a single flat, ordered plan of (channel, scheduledAt) steps.
// The sweep must send only the NEXT due step, one channel per sweep.
//
// The plan is derived from the existing Campaign columns so no schema change is
// required and legacy campaigns keep working:
//   channels        merchant order, e.g. ['email', 'whatsapp']
//   maxFollowUps    number of ROUNDS (initial + follow-ups) — legacy semantics
//   sendDelay       minutes after abandonment before the first step
//   followUpDelay   minutes between consecutive steps
//
// A round is one pass over the configured channels. So channels=[email,whatsapp]
// with maxFollowUps=2 yields: email, whatsapp, email, whatsapp. That preserves
// "two follow-ups per channel" (each channel advances through every round).

export type RecoveryChannel = 'email' | 'whatsapp'

export const SUPPORTED_RECOVERY_CHANNELS: readonly RecoveryChannel[] = ['email', 'whatsapp']

/** Default order when a campaign has no usable channels configured. Mirrors the
 *  legacy fallback in the sweep, but with email first so the very first touch is
 *  the channel that needs no consent. */
export const DEFAULT_CHANNEL_ORDER: readonly RecoveryChannel[] = ['email', 'whatsapp']

/** Hard ceiling on rounds so a corrupt campaign row can never fan out into a
 *  spam loop. Matches the legacy sweep's 1..5 clamp. */
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 5

/** Safety floor between two consecutive sends. Even if a merchant sets a tiny
 *  followUpDelay, two messages are never closer than this — the spec explicitly
 *  forbids 15-minute spam intervals. */
export const MIN_STEP_INTERVAL_MS = 30 * 60 * 1000

export type CampaignSequenceConfig = {
  channels: string[]
  maxFollowUps: number
  sendDelay: number
  followUpDelay: number
}

export type ScheduledRecoveryStep = {
  /** Flat 0-based index. Stored as `Message.step` so the existing
   *  `(cartId, channel, step)` unique index keeps sends idempotent. */
  index: number
  /** 0 = initial pass, 1..n = follow-up rounds. */
  round: number
  channel: RecoveryChannel
  /** Absolute moment this step becomes eligible. */
  scheduledAt: Date
}

export type RecoveryMessageLike = {
  channel: string
  step: number | null
  status: string
}

export type NextStepResult =
  | { done: true; reason: 'completed' }
  | { done: false; step: ScheduledRecoveryStep }

export type BuildSequenceOptions = {
  /** Floor between consecutive steps. Defaults to MIN_STEP_INTERVAL_MS. */
  minStepIntervalMs?: number
  /** Rounds ceiling. Defaults to MAX_ROUNDS. */
  maxRounds?: number
}

const COMPLETED_MESSAGE_STATUSES = new Set(['sent', 'delivered', 'skipped'])

export function isSupportedRecoveryChannel(value: string): value is RecoveryChannel {
  return (SUPPORTED_RECOVERY_CHANNELS as readonly string[]).includes(value)
}

/** Ordered, de-duplicated, supported channels. Falls back to the default order
 *  when the merchant configured nothing usable. Order is significant: it is the
 *  merchant's channel priority within each round. */
export function sanitizeChannels(channels: string[] | null | undefined): RecoveryChannel[] {
  const seen = new Set<RecoveryChannel>()
  const ordered: RecoveryChannel[] = []
  for (const raw of channels ?? []) {
    const channel = String(raw).toLowerCase()
    if (!isSupportedRecoveryChannel(channel)) continue
    if (seen.has(channel)) continue
    seen.add(channel)
    ordered.push(channel)
  }
  if (ordered.length === 0) return [...DEFAULT_CHANNEL_ORDER]
  return ordered
}

export function clampRounds(maxFollowUps: number, maxRounds = MAX_ROUNDS): number {
  const n = Number.isFinite(maxFollowUps) ? Math.floor(maxFollowUps) : MIN_ROUNDS
  return Math.max(MIN_ROUNDS, Math.min(maxRounds, n))
}

/** Build the full ordered schedule for one cart. */
export function buildRecoverySequence(
  config: CampaignSequenceConfig,
  abandonedAt: Date,
  options: BuildSequenceOptions = {},
): ScheduledRecoveryStep[] {
  const channels = sanitizeChannels(config.channels)
  const rounds = clampRounds(config.maxFollowUps, options.maxRounds ?? MAX_ROUNDS)
  const intervalMs = Math.max(
    MIN_STEP_INTERVAL_MS,
    finiteMinutesToMs(config.followUpDelay),
  )
  const firstDelayMs = Math.max(0, finiteMinutesToMs(config.sendDelay))

  const steps: ScheduledRecoveryStep[] = []
  let at = abandonedAt.getTime() + firstDelayMs
  let index = 0
  for (let round = 0; round < rounds; round++) {
    for (const channel of channels) {
      steps.push({ index, round, channel, scheduledAt: new Date(at) })
      index++
      at += intervalMs
    }
  }
  return steps
}

/** The next step that still needs a send. Returns `done` once every step has a
 *  terminal message (sent / delivered / skipped) for its channel+index.
 *
 *  A `failed` message is intentionally NOT terminal: the step stays current so
 *  it can be retried (with backoff) instead of being skipped over. */
export function resolveNextStep(
  sequence: ScheduledRecoveryStep[],
  messages: RecoveryMessageLike[],
): NextStepResult {
  const completed = new Set<string>()
  for (const message of messages) {
    if (message.step === null || message.step === undefined) continue
    if (!COMPLETED_MESSAGE_STATUSES.has(message.status)) continue
    completed.add(`${message.channel}:${message.step}`)
  }
  for (const step of sequence) {
    if (!completed.has(`${step.channel}:${step.index}`)) {
      return { done: false, step }
    }
  }
  return { done: true, reason: 'completed' }
}

export function isStepDue(step: ScheduledRecoveryStep, now: Date): boolean {
  return now.getTime() >= step.scheduledAt.getTime()
}

/** True when a campaign has outlived its useful life. An ancient cart should
 *  not be messaged weeks later just because the shopper never bought. */
export function isCampaignExpired(
  abandonedAt: Date,
  now: Date,
  expiryDays: number,
): boolean {
  if (!Number.isFinite(expiryDays) || expiryDays <= 0) return false
  return now.getTime() - abandonedAt.getTime() > expiryDays * 24 * 60 * 60 * 1000
}

export type CampaignStopReason =
  | 'converted'
  | 'suppressed'
  | 'expired'
  | 'sequence_exhausted'

export type CampaignStopInput = {
  cart: { convertedAt?: Date | string | null; isRecovered?: boolean | null }
  identity?: { suppressed?: boolean | null; optedOutAt?: Date | string | null } | null
  next: NextStepResult
  abandonedAt: Date
  now: Date
  expiryDays?: number
}

/** Central "should this cart still be worked?" gate. Purchase, suppression and
 *  campaign expiry all stop the sequence immediately. */
export function evaluateCampaignStop(input: CampaignStopInput): CampaignStopReason | null {
  if (input.cart.convertedAt || input.cart.isRecovered) return 'converted'
  if (input.identity?.suppressed || input.identity?.optedOutAt) return 'suppressed'
  if (
    input.expiryDays !== undefined &&
    isCampaignExpired(input.abandonedAt, input.now, input.expiryDays)
  ) {
    return 'expired'
  }
  if (input.next.done) return 'sequence_exhausted'
  return null
}

function finiteMinutesToMs(minutes: number): number {
  const n = Number(minutes)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n * 60 * 1000
}
