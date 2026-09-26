# ADR-009 — Payment path & webhook consolidation (resolved)

## Context
Two Razorpay webhook handlers existed:
- `src/app/api/payments/webhook/route.ts` — legacy handler, the one the
  frontend shim (`src/app/api/payment/webhook/route.ts`) re-exports.
- `src/app/api/webhooks/payment/razorpay/route.ts` — newer gateway-adapter
  handler introduced during the payments refactor.

Both verified signatures and mark/poll payment records.

## Decision (updated — RESOLVED)
The merchant dashboard registers exactly:

**`https://cart-gain.com/api/payment/webhook`**

which routes to the `payment/webhook` shim → the **`payments/webhook` handler**
(which verifies the Razorpay signature via `verifyWebhookSignature`).

Consequently:
- `payments/webhook/route.ts` is the **canonical** handler.
- The adapter route `api/webhooks/payment/razorpay/route.ts` was **deleted**
  (it never receives delivery; zero in-code references; grep-verified).
- The `razorpay-adapter` **library is retained** — it is still used by
  `lib/payments/gateway.ts` and `lib/payments/__tests__/adapters.test.ts`.

## Alternatives considered
- Keep both forever — uneconomic: dead code that looks like two payment paths.
- Merge handlers before confirmation — rejected at the time (silent loss of
  payment recovery); now moot.

## Consequences
- One Razorpay webhook surface (`/api/payment/webhook`) — verified live after
  deploy via a signed-payload probe.
- Frontend `payment/*` shims unchanged; Cashfree webhook
  (`api/webhooks/payment/cashfree`) untouched (separate provider).

## Status
RESOLVED.