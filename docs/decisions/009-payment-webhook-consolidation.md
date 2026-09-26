# ADR-009 — Payment path & webhook consolidation (mid-flight)

## Context
Two Razorpay webhook handlers exist:
- `src/app/api/payments/webhook/route.ts` — legacy handler, the one the
  frontend shim (`src/app/api/payment/webhook/route.ts`) re-exports.
- `src/app/api/webhooks/payment/razorpay/route.ts` — newer gateway-adapter
  handler introduced during the payments refactor.

Both verify signatures and mark/poll payment records. **Which URL is actually
registered in the merchant's Razorpay dashboard is not derivable from code** and
is unverifiable from this working copy (owner-only dashboard access).

Additionally `src/lib/validation.ts` (auth + campaign schemas, validators) and
`src/lib/validation/bargain.ts` (bargain-specific schemas importing the former)
are **complementary, not duplicates** — a healthy split that is kept as-is.

## Decision
- Keep both webhook handlers live for now. Do **not** blind-consolidate:
  de-registering the wrong URL breaks production payment recovery.
- The legacy `payments/webhook` remains canonical for `payment/*` (the paths the
  frontend calls); the adapter handler is the forward direction.
- Add a code comment atop each handler stating it belongs to the same logical
  webhook and must be retired once the dashboard registration is confirmed.
- Document the owner action: confirm which URL is registered in the Razorpay
  dashboard, then retire the other handler and delete its `__tests__/` (until
  then, the duplicate test file under `payments/webhook/__tests__/` stays as the
  single test surface).

## Alternatives considered
- Remove one handler now — rejected (risk of silent payment recovery loss).
- Merge handlers behind a shared `handleRazorpayEvent` — natural follow-up
  AFTER registration is confirmed; deferred to avoid dual-write risk mid-transit.

## Consequences
- Slight duplication persists until owner confirmation. Fully documented.
- Phase 9 removed the inert nested `jest.config`s and the duplicate shim test
  file; the remaining single canonical test surface is `payments/webhook/__tests__`.

## Status
Accepted — provisional, awaiting owner confirmation of dashboard registration.