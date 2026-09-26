# CartGain — Final Architecture

*Status: authoritative as of the codebase transformation (master `HEAD`).*
*Accompanies `CODEBASE_AUDIT.md` (findings) and `docs/decisions/` (ADRs).*

## 1. System at a glance

CartGain is a Shopify cart-recovery + AI-bargain SaaS on Vercel serverless:

```
Shopify Storefront (theme)
  └─ BargainWidget (embeddable, iframe, cg_resize height protocol)
Shopify Admin (OAuth · GraphQL · webhooks · Billing)
Customer / Merchant flows
  ├─ Merchant Dashboard (Next.js App Router)      ── merchant-isolated by session
  ├─ CartGain API (99 Route Handlers under /api)
  ├─ Recovery redirects (/r source tags, click/COD/payment-resume)
  └─ Bargain API (embed → start/offer/accept/status)
Backing services
  ├─ PostgreSQL (Supabase, Prisma 5, relationMode="prisma")
  ├─ Redis (Bull queues + de-dup locks + rate limits)
  ├─ OpenAI / OpenAI-compatible fallback (Groq)
  ├─ Razorpay (primary) + Cashfree (secondary) + Shopify Billing
  ├─ WhatsApp (Meta Graph) · Resend (email) · MSG91 (SMS)
Observability: x-request-id corridor · structured logger (redacted) · alerter · /api/health
```

## 2. Layered trust model (the core guarantee)

The bargain negotiator is bounded: money never depends on the model.

```
Customer ─▶ Bargain API ─▶ Session State Machine ─▶ Product Context
          ─▶ Deterministic Policy (floor·attempts·campaign·coupons·stock)
          ─▶ AI Negotiator (wording/tactic ONLY)
          ─▶ validateOffer() + buildExecutablePrice()  ◀─ hard, server-side, integer minor units
```

- Floor is computed + enforced in integer minor units; proven by 5000-deal
  property fuzz (`financial-safety.test.ts`).
- Merchant floor is never serialized to the browser nor interpolated into the
  prompt. Session transitions are impossible by construction
  (`negotiation-state.ts`).
- Walk-out (`quit`/`i quit`) → retention path; only budget-end or second
  walk-out closes. AI personas are copy-layer only (ADR-005).

## 3. Domains & their homes

| Domain | Where it lives | Notes |
|--------|----------------|-------|
| Bargain safety | `src/lib/financial-safety.ts`, `offer-validation.ts`, `abuse.ts`, `intent.ts`, `negotiation-state.ts` | Multi-layer; high test density |
| Recovery attribution | `src/lib/attribution.ts`, `bargain/goals.ts` | Evidence-based; refund-netted |
| Payments | `lib/payment.ts` + `lib/payments/*` adapters; routes `api/payments/*`, `api/payment/*` (shims), `api/webhooks/payment/cashfree` | Single Razorpay webhook (`/api/payment/webhook`) — adapter route retired after owner confirmed the registered URL (ADR-009) |
| Shopify | `lib/shopify*` adapters; `api/shopify/*`; `extensions/` | HMAC-verified webhooks, encrypted tokens, purge on uninstall |
| Queue | `lib/jobs/*` + `lib/queue/` | Bull + ioredis in-process; NX dedupe; idempotent processors |
| Observability | `lib/observability/*` | `captureError`/`logWarn` with redaction |

Route handlers remain flat under `src/app/api` (99 routes). Logical bundles
(above) are the maintainable seams; physical regrouping is incremental (ADR-001).

## 4. Isolation & security postures

- **Merchant isolation**: store-scoped queries gate on `store.findFirst({ id,
  userId })` / API-key `auth.ctx.userId`; sampled across campaigns, keys, carts,
  rto, bargain config & products (audit verified).
- **Webhooks fail closed**: Shopify HMAC, Razorpay signature, WhatsApp
  `X-Hub-Signature-256` — unsigned/incorrect payloads return 401 (audit finding
  S-2 originally mis-read, then corrected).
- **Envelope + traceability**: typed API errors `{ success, error:{code,
  message}, requestId }` (`lib/api-error.ts`); `x-request-id` threaded through
  middleware → logs → `requestId` payloads.
- **Secrets**: `.env*` gitignored; `credentials/`, telemetry, user-history local
  tooling gitignored; CI fails on any tracked secret file.

## 5. Data model (see `prisma/schema.prisma`)

- Stores/merchants, campaigns (A/B variants), carts + line items, messages with
  full delivery status, analytics events, shop sessions/offer history
  (`ShopBargainSession`), RTO config, payment recovery config, invoices,
  revenue-share ledger, job logs, webhook events.
- 20+ migrations; scale migration indexes hot queries; string status literals
  validated by the state-machine module (ADR-002).

## 6. Observability & reliability

- `x-request-id` middleware trace corridor (ADR-008).
- Structured, redacted logging; `captureError` persists failures with component
  + operation + statusCode + requestId; `alerter` escalates severe ones.
- `/api/health`: db / redis / env / ai / version (liveness+readiness combined
  — intentional).
- Queues are idempotent + de-duplicated; webhooks ack fast, process async.
- CI (`ci.yml`): install → lint → tsc → jest → build → tracked-secrets check.

## 7. Known risks carried deliberately (owner actions)

| Risk | Level | Action |
|------|-------|--------|
| ~~Two Razorpay webhooks~~ **RESOLVED** | — | Merchant confirmed registration = `/api/payment/webhook`; adapter route `webhooks/payment/razorpay` deleted; `razorpay-adapter` lib retained (ADR-009) |
| `vercel-build` runs `prisma db push --accept-data-loss` | HIGH (C-2) | Migrate to `prisma migrate deploy` when schema churn stabilizes |
| SQL-fallback in one recovery path (`raw` re-exec) absent | MEDIUM | Reviewed; defer |
| `.claude/**` + backup filename retain old brand | LOW | Local tooling / label only; inert (gitignored) |
| `deps`: `@vercel/functions` single-use, node SDK opaque | LOW | Cleanup when package list is revisited |

Verified non-issues: float-money in bargain (integer minor units), floor leaks
(never leaves server), prompt-injection/jailbreak (abuse firewall + property
tests), IDOR in sampled routes.

## 8. Deployments

- Vercel prod → https://cart-gain.com (`/`, `/api/health`, `/dashboard` 200 on
  last deploy). Shopify assets via `npx shopify app deploy`.
- Validation gate before every push: `npm run lint && npm run typecheck && npm
  test` (640 tests) && `npm run build`.

## 9. Deliverables from the transformation

- `docs/architecture/CODEBASE_AUDIT.md` — full inventory + classified findings.
- `docs/decisions/ADR-001…009` — the "why" behind the seams.
- `docs/security/`, `docs/operations/`, `docs/observability.md`,
  `docs/incident-response.md` — runbooks.
- `README.md` / `CONTRIBUTING.md` — accurate onboarding (CartGain, not
  RecoverFlow).
- Runtime hardening: WhatsApp webhook structured logs; typed error envelope;
  session state machine + quit semantics; CI quality gate; dead config/test
  cleanup; unused-decorative-dependency removal.