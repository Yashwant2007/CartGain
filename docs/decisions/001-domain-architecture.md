# ADR-001 — Domain-oriented layout (maintainability, not purity)

## Context
The codebase grew organically: `src/lib` holds bargain, payments, shopify,
jobs, rto, analytics, observability and security helpers side by side, and 99
API route handlers live flat under `src/app/api`. The code is testable and
working, but domain boundaries are implicit and new engineers struggle to find
"where the bargain lives" vs "where everything lives".

## Decision
Incrementally migrate toward a feature-oriented layout (`features/bargain`,
`features/recovery`, `features/billing`, `features/analytics`, …) with
infrastructure hidden behind interfaces. Migrations happen per-module, with
behavior-preserving moves and zero big-bang rewrites. Existing `src/lib/*`
packages are the seeds: `lib/bargain` already reads like a domain package.

Physical reorganization may lag the logical separation; both are worth
maintaining, but **logical boundaries win**.

## Alternatives considered
- Full restructure in one pass — rejected: destructive churn, no CI safety net
  for 99 routes.
- No change — rejected: the spec's stated goal (a small team can navigate it)
  argues against a single 5k-LOC "services" bag.

## Consequences
- Gradual, low-risk commits; behavior preserved at every step.
- Some churn in import paths as modules move.
- Financial-safety and bargain domains stay together (they are the product).

## Status
Accepted. Ongoing incrementally.