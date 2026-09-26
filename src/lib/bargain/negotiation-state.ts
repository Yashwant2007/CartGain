// ─────────────────────────────────────────────────────────────────────────────
// BARGAIN SESSION STATE MACHINE — deterministic, server-side
// ─────────────────────────────────────────────────────────────────────────────
// The session lifecycle is a hard state machine. Status is persisted on the
// BargainSession row and every transition is exercised by the API layer (offer /
// accept). This module makes the graph explicit and testable so an illegal
// transition (e.g. EXPIRED → ACCEPTED) is impossible by construction, not by
// coincidence. The machine is ALSO server-authoritative: a customer can never
// move their own session — only route code enforcing deterministic rules does.
//
//   active ──► accepting ──► accepted
//   active ──► rejected | expired | abandoned
//
// `accepted` doubles as a *resumable* terminal: the accept route may re-fetch an
// already-locked deal (idempotent replay) but no new negotiation can start.

export const SESSION_STATUSES = [
  'active',
  'accepting',
  'accepted',
  'rejected',
  'expired',
  'abandoned',
] as const

export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** Legal transitions: `from` → one of `to`. Anything else is rejected. */
export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  active: ['accepting', 'accepted', 'rejected', 'expired', 'abandoned'],
  accepting: ['accepted'],
  accepted: [],
  rejected: [],
  expired: [],
  abandoned: [],
}

/** True when `from → to` is a legal transition. */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false
}

/** Terminal = no further negotiation; the conversation may only replay results. */
export function isTerminal(status: SessionStatus): boolean {
  return status === 'accepted' || status === 'rejected' || status === 'expired' || status === 'abandoned'
}

/** Open for negotiation. (Note: `accepting` is a brief, closed interim state.) */
export function isNegotiable(status: SessionStatus): boolean {
  return status === 'active'
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