// ── Storefront engagement: product-page dwell nudge settings ────────────────
// Pure, dependency-free helpers shared by the public dwell-config endpoint and
// its tests. The endpoint resolves a store by shop domain and hands the raw
// BargainConfig row here; this module is the single source of truth for the
// PUBLIC shape — no floors, margins, persona copy or customer data is ever
// included — and for clamping to safe bounds so a bad row can never tell the
// storefront to nudge after 0s or after a day.
export const DWELL_DEFAULT_SECONDS = 60
export const DWELL_DEFAULT_REMINDER_SECONDS = 60
export const DWELL_MIN_SECONDS = 5
export const DWELL_MAX_SECONDS = 600

export type DwellConfig = {
  enabled: boolean
  dwellSeconds: number
  reminderSeconds: number
}

export type DwellConfigSource =
  | {
      dwellNudgeEnabled?: boolean | null
      dwellSeconds?: number | null
      dwellReminderSeconds?: number | null
    }
  | null
  | undefined

function clampSeconds(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(DWELL_MAX_SECONDS, Math.max(DWELL_MIN_SECONDS, n))
}

/**
 * Build the customer-safe engagement payload.
 *
 * A missing config (unknown or inactive store, or a store that never opened the
 * bargain dashboard) is treated as disabled — the controller must never nudge
 * on a page CartGain does not own. The nudge is gated ONLY on
 * `dwellNudgeEnabled`: like the embed widget, which deliberately ignores the
 * `enabled` master toggle, a store whose widget is present can still nudge.
 */
export function publicDwellConfig(config: DwellConfigSource): DwellConfig {
  return {
    enabled: config?.dwellNudgeEnabled === true,
    dwellSeconds: clampSeconds(config?.dwellSeconds, DWELL_DEFAULT_SECONDS),
    reminderSeconds: clampSeconds(config?.dwellReminderSeconds, DWELL_DEFAULT_REMINDER_SECONDS),
  }
}
