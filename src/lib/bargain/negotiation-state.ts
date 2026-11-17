// ─────────────────────────────────────────────────────────────────────────────
// BARGAIN SESSION STATE MACHINE — deterministic, server-side
// ─────────────────────────────────────────────────────────────────────────────
// The session lifecycle is a hard state machine. Status is persisted on the
// BargainSession row and every transition is exercised by the API layer (offer /
// accept / purchase attribution). This module makes the graph explicit and
// testable so an illegal transition (e.g. EXPIRED → ACCEPTING) is impossible by
// construction, not by coincidence. The machine is ALSO server-authoritative: a
// customer can never move their own session — only route code enforcing
// deterministic rules does.
//
//   active ──► accepting ──► accepted ──► purchased
//   accepting ──► active          (Shopify code creation failed; retryable)
//   accepted ──► accepting        (legacy no-code session reclaim only)
//   rejected | expired | abandoned ──► purchased
//
// `accepted` remains a resumable terminal (idempotent accept replay); `purchased`
// is absorbing — no transition out of it is legal.

export const SESSION_STATUS = {
  ACTIVE: 'active',
  ACCEPTING: 'accepting',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  ABANDONED: 'abandoned',
  PURCHASED: 'purchased',
} as const

export const SESSION_STATUSES = [
  SESSION_STATUS.ACTIVE,
  SESSION_STATUS.ACCEPTING,
  SESSION_STATUS.ACCEPTED,
  SESSION_STATUS.REJECTED,
  SESSION_STATUS.EXPIRED,
  SESSION_STATUS.ABANDONED,
  SESSION_STATUS.PURCHASED,
] as const

export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** Legal transitions: `from` → one of `to`. Anything else is rejected. */
export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  [SESSION_STATUS.ACTIVE]: [
    SESSION_STATUS.ACCEPTING,
    SESSION_STATUS.ACCEPTED,
    SESSION_STATUS.REJECTED,
    SESSION_STATUS.EXPIRED,
    SESSION_STATUS.ABANDONED,
  ],
  [SESSION_STATUS.ACCEPTING]: [SESSION_STATUS.ACCEPTED, SESSION_STATUS.ACTIVE],
  [SESSION_STATUS.ACCEPTED]: [SESSION_STATUS.ACCEPTING, SESSION_STATUS.PURCHASED],
  [SESSION_STATUS.REJECTED]: [SESSION_STATUS.PURCHASED],
  [SESSION_STATUS.EXPIRED]: [SESSION_STATUS.PURCHASED],
  [SESSION_STATUS.ABANDONED]: [SESSION_STATUS.PURCHASED],
  [SESSION_STATUS.PURCHASED]: [],
}

/** Session statuses a verified order can settle into `purchased` from. */
export const PURCHASE_SOURCE_STATUSES: readonly SessionStatus[] = [
  SESSION_STATUS.ACCEPTED,
  SESSION_STATUS.REJECTED,
  SESSION_STATUS.EXPIRED,
  SESSION_STATUS.ABANDONED,
]

export type SessionTransitionKind = 'forward' | 'rollback' | 'legacy-recovery' | 'purchase'

export type SessionTransitionResult =
  | { ok: true; from: SessionStatus; to: SessionStatus; kind: SessionTransitionKind }
  | { ok: false; from: unknown; to: unknown; reason: 'INVALID_FROM' | 'INVALID_TO' | 'ILLEGAL_TRANSITION' }

/** True when `from → to` is a legal transition. */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false
}

/** Validate a proposed transition with an explicit reason and transition kind. */
export function checkSessionTransition(from: unknown, to: unknown): SessionTransitionResult {
  if (!isSessionStatus(from)) return { ok: false, from, to, reason: 'INVALID_FROM' }
  if (!isSessionStatus(to)) return { ok: false, from, to, reason: 'INVALID_TO' }
  if (!canTransition(from, to)) return { ok: false, from, to, reason: 'ILLEGAL_TRANSITION' }
  const kind: SessionTransitionKind =
    to === SESSION_STATUS.PURCHASED ? 'purchase'
    : from === SESSION_STATUS.ACCEPTING && to === SESSION_STATUS.ACTIVE ? 'rollback'
    : from === SESSION_STATUS.ACCEPTED && to === SESSION_STATUS.ACCEPTING ? 'legacy-recovery'
    : 'forward'
  return { ok: true, from, to, kind }
}

/** An `accepted` row may only be reclaimed by the no-code legacy accept path. */
export function canRecoverLegacyAccept(session: { status: unknown; discountCode?: string | null }): boolean {
  return session.status === SESSION_STATUS.ACCEPTED && !session.discountCode
}

const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  SESSION_STATUS.ACCEPTED,
  SESSION_STATUS.REJECTED,
  SESSION_STATUS.EXPIRED,
  SESSION_STATUS.ABANDONED,
  SESSION_STATUS.PURCHASED,
])

/** Terminal = no further negotiation; the conversation may only replay results. */
export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** Open for negotiation. (Note: `accepting` is a brief, closed interim state.) */
export function isNegotiable(status: SessionStatus): boolean {
  return status === SESSION_STATUS.ACTIVE
}

// ─────────────────────────────────────────────────────────────────────────────
// WALKOUT ESCALATION (spec: do NOT terminate on casual "I quit" wording)
// ─────────────────────────────────────────────────────────────────────────────
// A single walkout ("I'm out", "I quit", "give up"…) is treated as a RETENTION
// event, not a termination: the AI gets one clear, deterministic chance to save
// the deal (the store's conversion funnel is the point). The session is only
// closed (abandoned) on a SECOND walkout or when the attempt budget is already
// spent. Decisions here are pure functions of session state — the LLM never
// decides who walks out or when a session ends.
export function walkoutOutcome(opts: { hadRetention: boolean; attemptsRemaining: number }): 'retain' | 'abandon' {
  return opts.hadRetention || opts.attemptsRemaining <= 0 ? 'abandon' : 'retain'
}

/** Human words that signal walk-it-like-it-is exit intent (deterministic). */
export function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value)
}
