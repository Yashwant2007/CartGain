// ── Environment-driven feature flags ─────────────────────────
// Server-only. Every flag defaults OFF so a missing or typo'd env var can never
// silently enable an experimental path in production. Only an explicit truthy
// value enables it. Flags are read at call time (not module load) so tests and
// request-scoped env overrides behave predictably.
//
// Flags are additive roll-out controls, NOT merchant configuration. A merchant
// setting lives in the database (BargainConfig); a flag decides whether the
// code path is live at all. When a flag graduates, its default flips to true
// and the env var becomes an escape hatch rather than an opt-in.

const TRUTHY = new Set(['1', 'true', 'on', 'yes', 'enabled'])

export type FeatureFlag =
  // Module 3 — first-party secure bargain quotes (signed token, lifecycle,
  // audit, revocation). OFF keeps the legacy discount-code-only path.
  | 'BARGAIN_QUOTE'
  // Module 7 — dual-agent learning with holdout experiments.
  | 'BARGAIN_DUAL_AGENT'

const DEFAULTS: Record<FeatureFlag, boolean> = {
  BARGAIN_QUOTE: false,
  BARGAIN_DUAL_AGENT: false,
}

/** True when `flag` is enabled for this process. Unknown values fall to the default. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const raw = process.env[flag]
  if (raw == null || raw.trim() === '') return DEFAULTS[flag]
  return TRUTHY.has(raw.trim().toLowerCase())
}

/** Snapshot of every flag and its effective value — for /api/health and ops. */
export function featureFlagSnapshot(): Record<FeatureFlag, boolean> {
  const out = {} as Record<FeatureFlag, boolean>
  for (const flag of Object.keys(DEFAULTS) as FeatureFlag[]) {
    out[flag] = isFeatureEnabled(flag)
  }
  return out
}
