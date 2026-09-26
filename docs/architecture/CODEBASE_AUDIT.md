# CartGain — Codebase Audit (Phase 0)

> Status: **completed 2026-09-26** · Author: staff engineering audit pass
> This document is the source-of-truth inventory of the repository **at the time
> of writing**, produced **before** any transformation changes. It records what
> exists, what works, what is risky, and what is missing. Items are classified
> `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` and scheduled `FIX NOW` / `FIX BEFORE
> PRODUCTION` / `FIX DURING REFACTOR` / `DEFER`.

---

## 1. Repository snapshot

| Metric | Value |
| --- | --- |
| Stack | Next.js 14.2 (App Router, TypeScript strict), React 18, Tailwind |
| API | Next.js Route Handlers + NextAuth v4 (Credentials) |
| DB | PostgreSQL (Supabase) via Prisma 5, `relationMode = "prisma"` |
| Queue | Bull (`bull` + `ioredis`), in-process within Vercel serverless |
| Messaging | Resend (email), WhatsApp webhook (Meta Graph), SMS via Resend/Razorpay paths |
| Payments | Razorpay primary; Cashfree secondary; Shopify Billing (app subscription) |
| AI | OpenAI primary + OpenAI-compatible fallback (Groq, `gpt-oss-120b`) |
| Tests | Jest 30 + ts-jest, 46 suites / 636 tests (all green) |
| CI/CD | GitHub Actions: `backup.yml` (DB backup), `restore-test.yml` — **no CI workflow** |
| Deploy | Vercel (`cart-gain.com`), Shopify App (`shopify.app.toml`) |
| Codebase | 295 TS/TSX files, ~54k LOC in `src/` |

### Verified working behaviors (sampled)
- Active storefront bargain (embed + floating widget), negotiated deals written as
  Shopify discount codes, daily goals, revenue-share attribution.
- Recovery: abandoned-cart messages (email), recovery attribution lifecycle,
  cash-on-delivery nudges (COD→prepaid), RTO risk scoring.
- Billing: Razorpay subscriptions, Shopify Billing reconcile, invoices,
  revenue-share ledger.
- Security primitives that already exist (verified by reading the code):
  - `src/lib/env.ts` — runtime env validation with fail-fast for required vars.
  - `src/middleware.ts` — `x-request-id` trace corridor for `/api/*`.
  - `src/lib/api-error.ts` — non-leaking `{ message }` 500 responses.
  - `src/lib/with-rate-limit.ts` + `src/lib/rate-limit.ts` — endpoint rate limits;
    **every** bargain API route (`start`, `offer`, `accept`, `demo`,
    `session/[id]`) uses it.
  - `src/lib/shopify.ts` — centralized `verifyShopifyWebhook` HMAC check; the
    Shopify webhook handler verifies synchronously then processes async with
    Redis dedup (`redisSetNX`), per-topic error capture, and alerting.
  - `src/lib/observability/logger.ts` — structured error capture.
  - `src/lib/data-protection.ts` — `DataAccessLog` on PII reads; data
    export/redaction/purge paths (`purgeStoreData`, `redactCustomer`).
  - `src/lib/encryption.ts` — encrypted storage of store secrets.
  - `src/lib/job-auth.ts` + `src/lib/job-lock.ts` — authenticated, deduped jobs.

### Verification commands that currently pass
```bash
npx tsc --noEmit        # clean
npm run lint            # clean
npx jest                # 636 passed / 46 suites
npm run build           # prisma generate && next build (verified previously)
```

---

## 2. Architecture today (as built)

```
src/
├── app/                      # Next.js App Router (99 API route handlers + pages)
│   ├── api/                  # api/*  (auth, bargain, shopify, payments, jobs…)
│   ├── auth/                 # /auth/* pages (login, signup, 2fa…)
│   ├── dashboard/            # merchant dashboard
│   ├── bargain/              # embed + page (storefront bargain host page)
│   ├── demo/ s/ r/           # demo surfaces, storefront redirects
│   └── marketing pages        # pricing, terms, privacy, docs…
├── components/               # ui primitives (Button/Card/Badge) + domain surfaces
├── lib/                      # "everything else" — services, infra, bargain, payments…
└── middleware.ts             # trace-id corridor + next-auth gate
```

The repository is **functionally organized but physically flat**: the `src/lib`
folder holds mixed domains (bargain, payments, shopify, jobs, rto, analytics,
observability, ai, security helpers) side by side. This works and is testable,
but the domain boundaries are implicit.

---

## 3. Domain inventory

### 3.1 Bargain — `src/lib/bargain/*`, `src/app/api/bargain/*`
Extremely mature for a v1 SaaS. Verified strengths:
- **Financial safety layer** (`src/lib/financial-safety.ts`): integer minor-unit
  math, floor invariant `chargeMinor >= floorMinor`, percentage-encoding rounding
  safety net, bulk-quantity floor binding, order-level percent clamp. Floor is
  server-only and never serialized to clients.
- **Deterministic offer validation** (`src/lib/bargain/offer-validation.ts`):
  machine-readable reason codes (`BELOW_FLOOR_REJECTED`, `COUPON_STACKING_BLOCKED`,
  `CAMPAIGN_EXPIRED`, `NEGOTIATION_LIMIT_REACHED`, …), runs **before** accept,
  human-safe mapped messages that never reveal the floor.
- **Abuse firewall** (`src/lib/bargain/abuse.ts`): unicode/homoglyph sanitization,
  prompt-injection + jailbreak detection, exfiltration, flooding/repetition,
  severity scales to consume/non-consume attempts.
- **Deterministic intent classification** (`src/lib/bargain/intent.ts`): budget
  extraction, objections, walkout — all regex-driven, LLM-independent.
- Session state machine via `BargainSession.status`
  (`active | accepted | rejected | expired | abandoned`) with server-side
  transitions; session binding (`session-bind.ts`), attempt budgets, product
  context (`product-context.ts`), goals and discounts as separate modules.
- The AI **cannot** set prices: it produces a reply + tactic; every price an
  accept computes goes through `buildExecutablePrice`/`validateOffer`. The AI
  prompt carries DEAL STATE + product-value rules (Addendum H).

### 3.2 Recovery / abandonment — `src/lib/attribution.ts`, `src/lib/jobs/*`, `carts`, `message`
- Attribution lifecycle has explicit states and `isMessageAttributable` +
  `computeRefundNetting` (refund-aware). RTO scoring (`src/lib/rto`).
- Cart processing jobs (`processAbandonedCarts`, `processRetryPayments`,
  `processRevenueShareBilling`) exist with job-auth + lock.

### 3.3 Payments — **DUPLICATED** (see §5.1). `src/lib/payment.ts` (legacy
monolith) vs `src/lib/payments/*` (adapter-based: razorpay-adapter,
cashfree-adapter, gateway, recovery, types).

### 3.4 Shopify — `src/lib/shopify*.ts`, `src/app/api/shopify/*`, `src/lib/shopify-billing/*`,
`extensions/cart-gain-bargain`, `extensions/storefront-bargain`,
`.shopify/` (dev/deploy bundles). OAuth + session tokens + webhooks verified;
install/pending-install flows present.

### 3.5 AI — `src/lib/ai-client.ts`, `src/lib/services/ai.ts`, quota + fallback.

### 3.6 Billing/subscription — `src/lib/payment.ts`, `src/lib/subscription.ts`,
`src/lib/shopify-billing/*`, Razorpay subscriptions.

---

## 4. Findings by category

> Legend → Class: **C**=critical, **H**=high, **M**=medium, **L**=low · DO:
> **N**=fix now, **P**=fix before production, **R**=fix during refactor, **D**=defer

### 4.1 Naming / branding (stale RecoverFlow)
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| N-1 | Root README is a RecoverFlow marketing/ops doc, not a CartGain README | M | R | `README.md:1 "# RecoverFlow 🚀"`, stale URLs/emails/domains throughout |
| N-2 | `prisma/schema.prisma` header comment still says "Prisma Schema for RecoverFlow" | L | R | line 1 |
| N-3 | `.env.example:2` header + `EMAIL_FROM="noreply@recoverflow.com"` | M | R | line 49 |
| N-4 | `backup.yml` artifact naming `recoverflow-prod-*.sql.gz` (label only, no functional issue) | L | D | `.github/workflows/backup.yml:21` |

### 4.2 Duplicate / legacy code
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| D-1 | Two payment "API surfaces": `src/app/api/payment/*` are **pure re-exports** of `src/app/api/payments/*` — harmless, removable | L | R | `payment/create-order/route.ts` = `export { POST } from '../../payments/create-order/route'` |
| D-2 | **Two Razorpay webhook handlers for the same product area**: `src/app/api/payments/webhook/route.ts` (uses legacy `@/lib/payment` directly, RAW `razorpay` client, NX-dedup) vs `src/app/api/webhooks/payment/razorpay/route.ts` (uses `razorpayAdapter` + `lib/payments/recovery`) — **which one is wired in the merchant Razorpay dashboard is unverifiable from code** | H | P | both files; see §5.1 |
| D-3 | `src/app/api/webhooks/payment/razorpay` AND `src/app/api/webhooks/payment/cashfree` exist but `payments/webhook` also handles Razorpay — overlapping responsibility | H | P | §5.1 |
| D-4 | `src/lib/payment.ts` (monolith: `PLANS`, `razorpay`, `verifyWebhookSignature`, billing) overlaps `src/lib/payments/*` adapter package + `src/lib/shopify-billing/*` | M | R | `PLANS` imported from both sides |
| D-5 | `src/app/api/payments/webhook/jest.config` — a stray config file inside a route folder (harmless dead file) | L | R | file present |
| D-6 | Stray process-tooling folders at root (`.adal .augment .bob .claude … credentials/ telemetry/ user-history/ cache/ bin/ logs/`) — all **gitignored**, none committed | L | D | `.gitignore` |

### 4.3 Security
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| S-1 | Merchant/store ownership **verified enforced** in all sampled dashboard-scoped routes: `campaigns/[id]`, `keys/[id]`, `carts` (API-key + `store.userId === auth.ctx.userId`), `rto/config` (GET+POST), `bargain/config`, `bargain/products` all gate on `store.findFirst({ id, userId: session.user.id })`. Residual: several dozen routes not individually sampled | L | R | sampled in Phase 1 |
| S-2 | WhatsApp webhook is **verified and fail-closed** (`verifyHubSignature` → 401 on unsigned/unknown-secret payloads; GET handshake verifies `hub.verify_token` with timing-safe compare). Residual nit: uses `console.warn/error` instead of the structured logger | L | R | `webhooks/whatsapp/route.ts:26,42` |
| S-3 | Many route handlers return generic `{message}` on error (safe), but errors are logged ad-hoc with `console.error` in places rather than through `observability/logger` | M | R | sampled across routes |
| S-4 | Some routes accept optional client identity fields with multiple fallbacks (email, phone, fingerprint). Session takeover risk is mitigated by `session-bind.ts` but worth an adversarial test | M | R | bargain offer route |
| S-5 | `.env*.local` + secrets correctly gitignored; `.env` not tracked (verified via `git ls-files`) | — | — | good state |
| S-6 | CSP exists in `next.config.js` (incl. storefront-embed variant) | L | D | verified present |

### 4.4 Observability / operations
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| O-1 | `x-request-id` corridor covers `/api/*` only; not propagated into queue jobs, external-call spans, or outbound log lines uniformly | M | R | `src/middleware.ts` |
| O-2 | Health endpoint exists with db/redis/env/ai/version checks but combines liveness+readiness | L | R | `src/app/api/health/route.ts` |
| O-3 | Webhook processing is async + deduped + error-captured (good); success paths log `console.log` (fine) | — | — | good state |
| O-4 | **No CI workflow** — no automatic lint/typecheck/test gate on PRs | H | N | `.github/workflows/` has only backup + restore-test |

### 4.5 Database
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| DB-1 | Indexes added recently (`20260618075752_add_indexes_for_scale`) — good trajectory; some hot tables still query by `(storeId, status)` which is indexed | — | — | schema `@@index` |
| DB-2 | `status` columns are `String` with comment enums (not Postgres enums) — intentional for migration flexibility; acceptable | L | D | schema |
| DB-3 | No obvious N+1 found in the sampled bargain/recovery paths | — | — | verified samples |

### 4.6 Bargain safety (spec §7–14, §31–32)
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| B-1 | Financial safety layer is strong and complete (minor-unit math, floor invariant, accept-time re-fetch). AI has no price authority | — | — | `financial-safety.ts`, offer route |
| B-2 | **No deterministic `quit` command parser.** Per product spec the system must NOT terminate on casual "I quit" wording, and there is no explicit quit command required — but this behavior is **not codified in tests**. Add regression tests asserting "quit"/"walk away" do NOT end a session | H | N | grep `\bquit\b` across `src/` → no matches |
| B-3 | Offer route is large (~560 lines) — handler + negotiation + state + logging in one place | M | R | `offer/route.ts` |
| B-4 | Concurrent-offer safety (two simultaneous accepts/offers) — attempt increment is transactional; accept idempotency relies on status transition | M | R | offer route lines 272–285 |

### 4.7 Frontend / UI
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| F-1 | UI primitives exist (`Button`, `Card`, `Badge`) but many one-off cards in dashboard; no shared `Dialog/Input/Select/EmptyState` layer | M | R | `src/components/` |
| F-2 | Bargain widget is a single 2200-line component (`BargainWidget.tsx`) | M | R | file |
| F-3 | Accessibility: dialog has `aria-modal`, labels exist; no full keyboard-nav audit | M | R | widget |

### 4.8 Testing
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| T-1 | No `test:e2e`; no `test:integration` script; `jest` roots at `src/` only | M | R | `package.json` |
| T-2 | Security-matrix bargain tests (below-floor, NaN/Infinity, coupon stacking, etc.) exist in part; **no explicit state-transition or quit/walkout codification** | H | N | `__tests__/` |
| T-3 | Webhook integration tests exist for payments webhook; Shopify webhook has light coverage | M | R | `payments/webhook/__tests__` |

### 4.9 Configuration
| # | Finding | Class | DO | Evidence |
| --- | --- | --- | --- | --- |
| C-1 | Env validation exists (`src/lib/env.ts`) and is wired at subsystem entry points; not invoked globally at startup | L | D | file |
| C-2 | `vercel-build` runs `prisma db push --accept-data-loss` in production — **data-loss flag on prod build** | H | P | `package.json` |

---

## 5. Deep dives

### 5.1 Payment path duplication (critical to get right)
Three handlers overlap:
1. `POST /api/payments/webhook` — imports `verifyWebhookSignature/PLANS/getPlan`
   from legacy `@/lib/payment`, uses `razorpay` raw client, Redis NX dedup,
   `track` + `captureError`. Historically the primary.
2. `POST /api/webhooks/payment/razorpay` — newer adapter path
   (`razorpayAdapter`, `handlePaymentFailure`), richer recovery integration.
3. `POST /api/webhooks/payment/cashfree` — separate gateway.

Client code calls `api/payment/create-subscription` and
`api/payment/create-order` (the re-export shims), so **order/subscription creation
is unambiguous**. The ambiguous surface is the **webhook**: only one Razorpay
webhook URL can be registered in the merchant's Razorpay dashboard, and we cannot
determine from code which handler that is. **Risk:** if the configured URL points
at the legacy handler, newer recovery features and `lib/payments/recovery`
behaviors never fire; if it points at the new one, legacy behaviors (plan
upgrades, billing events) might be missing.

**Decision required from owner** (not resolvable by code inspection) before
consolidation in Phase 4.

### 5.2 Bargain financial flow (verified, matches spec §7)
```
Customer → bargain API → session state (server) → product context
  → deterministic policy (floor, attempts, campaign, coupon, availability)
  → AI negotiator (wording only, floor redacted from prompt) 
  → validateOffer() + buildExecutablePrice() (deterministic safety)
  → approved response → customer
```
Already conforms to the required architecture. The AI receives no floor value;
price-relevant numbers are interpolated from server-computed state.

### 5.3 Recovery attribution (spec §25) — verified present
`Message.status` lifecycle (`pending → sent → delivered → failed`),
`RecoveredCart` with conversion timestamp, refund netting
(`computeRefundNetting`), and `isMessageAttributable`. Recovery attribution is
evidence-based, not "message sent = recovered".

---

## 6. Missing abstractions (assessed honestly)
- **Bargain offer route is a god-handler** (~560 lines). A thin service extraction
  is warranted but must preserve behavior; scheduled Phase 3.
- **No cross-cutting typed API error envelope** (spec §19). Currently
  `{ message }`; introducing `{ success, error:{code,message}, requestId }` is a
  wide change — schedule during refactor with a compatibility shim.
- **No repository layer** — Prisma is called throughout. Given `relationMode =
  "prisma"` and the codebase size, repositories were avoided. Assessment: adding
  them is optional and **not a priority** (spec §6 allows "where useful").

---

## 7. Planned work (phases 1–9 summary)

| Phase | Scope | Real gap identified |
| --- | --- | --- |
| 1 | Safety foundation | WhatsApp webhook unverified fallback; uniform merchant-isolation sweep; CI gate |
| 2 | Bargain safety | Codify quit/walkout non-termination + state-transition tests; concurrent-offer hardening |
| 3 | Core architecture | Thin the bargain order offer handler; typed error envelope (compat shim) |
| 4 | Integrations | Payment webhook consolidation (needs owner decision); dead re-export shims removal |
| 5 | Frontend | Minor: shared `EmptyState`/`LoadingState`; keep scope small |
| 6 | Testing | Add scripts (`test:e2e`, `test:integration`) where jestifiable; security matrix |
| 7 | Observability/CI | Add `ci.yml` (install→lint→tsc→jest→build) |
| 8 | Documentation | README rewrite; ADRs; CONTRIBUTING; rename stale branding |
| 9 | Cleanup | Remove dead files/imports; fix schema/`.env.example` branding; no risky deletions |

All items above are budgeted so that **behavioral functionality is preserved**:
the goal is lower confusion, lower duplication, lower risk — not new folders.