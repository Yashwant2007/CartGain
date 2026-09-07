# Session Handoff — CartGain (RecoverFlow)

> **How to resume:** just tell me "Have a look at `SESSION-HANDOFF.md`" and I'll read this file to get back on the same page.

Last updated: Mon Sep 07 2026

## Where we are
Rebuilding/upgrading the **CartGain AI Bargain System** as a flagship premium conversion feature
(storefront widget + merchant dashboard + interactive demo). All existing functionality (recovery,
auth, billing, Shopify, analytics, pricing, PCD compliance) is preserved — do not regress it.

- **Branch:** `master` — all work committed, pushed, and deployed to **https://cart-gain.com** (HTTP 200).

## Repo facts / working conventions
- Stack: Next.js (App Router) + NextAuth v4 (JWT) + Prisma + Razorpay.
- Env files: `.env`, `.env.local` (gitignored). Prod DB not queryable locally (no creds).
- Deploys: `npx vercel --prod --yes` (aliases to `cart-gain.com`). Local curl sometimes hits transient DNS → 000; verify via deploy output / `vercel ls`.
- Verification commands: `npx tsc --noEmit`, `npm run lint`, `npx jest` (357 tests green, was 345).
- Commit style: lowercase, concise, e.g. `bargain dash: group config settings into ...`.

## Most recent work (this session) — all committed & deployed
0. **AI quota breaker + OpenAI-compatible fallback provider (Groq) — commits `c01acb0a`, `a9fe0a13`, `1c7ee8a3`, deployed & HTTP 200**
   - **Problem:** OpenAI account exhausted credits (`429 insufficient_quota` / `credit_balance_exhausted`). Root cause is billing — must add credits at platform.openai.com billing. User will recharge *"in a while"*.
   - **Quota breaker (`src/lib/ai-quota.ts`):** per-tier circuit breakers `isTierTripped(tier, now)` / `tripTierBreaker(tier, now)` (`AiTier = 'primary' | 'fallback'`, 15-min window); `shouldLogQuota()` logs once per window (no log spam); `isInsufficientQuotaError(err)` (status 402 or `insufficient_quota`). `resetQuotaBreakForTests()`.
   - **Fallback provider (`src/lib/ai-client.ts`):** `getAiClient(userKey?)` resolves **primary(OpenAI)→fallback(Groq)** — skips tripped tiers, respects per-user cooldowns (MAX 300s on 402, BASE 5s on 429). `handleAiFailure(err, context, userKey, tier)` trips proper tier on 402/429/**401** (auth failure added in `1c7ee8a3` to catch bad keys) + logs once per window. `decorateForFallback(client, model)` Proxy overrides model + auto-retries **without `response_format`** on 400 (JSON mode unsupported on some providers). Shared `userCooldowns` Map with size guard. `getAiHealth()` reports live tier state.
   - **Wired into every AI caller:** `src/lib/services/ai.ts` — all 11 helpers (email, sms, whatsapp, subject lines, probability, discount, intent, personalized discount, revenue coach, weekly report, campaign setup) use `getAiClient` + tier-aware `handleAiFailure`; each has a rule-based/heuristic fallback (`generateFallbackSubjects`, `computeProbabilityHeuristic`, `computeDiscountHeuristic`, `classifyIntentHeuristic`, `generateCoachHeuristic`, `generateReportHeuristic`, `defaultCampaignSetup`) so **nothing ever 500s**. `src/lib/services/bargain.ts` `negotiateStep` uses `getAiClient()` + `handleAiFailure`, falls back to `ruleBasedDecision`/`buildOpeningMessage`.
   - **Health endpoint (`/api/health`)** now exposes `checks.ai` (activeTier, primary configured, fallback configured/tripped/model/baseUrl) for live observability.
   - **Env vars:** `OPTIONAL_AI_VARS` in `src/lib/env.ts` — `AI_FALLBACK_API_KEY` (REQUIRED to activate fallback), `AI_FALLBACK_BASE_URL` (default `https://api.groq.com/openai/v1`), `AI_FALLBACK_MODEL` (default `llama-3.3-70b-versatile`). Existing `BARGAIN_MODEL` (default `gpt-4o`).
   - **Blocked until user acts:** fallback tier only active once `AI_FALLBACK_API_KEY` (Groq, free/no card, console.groq.com/keys) is added in Vercel → Settings → Environment Variables and redeployed. Until then app runs on heuristics (no crash, no log spam). When OpenAI recharged, it auto-returns as primary.
   - **Tests added/updated:** `src/lib/__tests__/ai-quota.test.ts` (tiers, independence, no-extension), `src/lib/__tests__/ai-client.test.ts` (model override passthrough, format-error retry, non-format rethrow). **369 tests total green.**
   - **`/api/carts/stats` implemented** (commit `1c7ee8a3`): closes the docs open item — returns 30d + all-time abandoned/recovered/recoveryRate/revenue for a store, read-auth.
0. **Dashboard flows completed (2FA QR + API keys + analytics) — commit `11637262`, deployed & HTTP 200**
   - **2FA QR fixed:** deprecated Google Charts QR generator replaced with server-side `qrcode` pkg — `src/lib/totp.ts::generateQrCodeDataUrl()` returns base64 PNG data URL; `/api/auth/2fa/setup` returns it; Security tab modal shows manual key + Copy button.
   - **API key management fully functional:** raw key `cg_<hex>`, SHA-256 hashed in DB, shown once. POST `/api/keys` takes `permissions[]` (`read`/`write`/`admin`, default `['read']`) + `expiresIn` (`30d`/`90d`/`365d`/`never`). Settings APISettings tab: permission chips, expiry selector, badges, lastUsedAt, revoke confirm, expired styling. Auth via `Authorization: Bearer cg_...` — `src/lib/api-key-auth.ts`, unified `src/lib/auth-context.ts` (`authenticate`/`hasPermission`/`isSessionAuth`); `/api/carts` GET=read, POST=write. Docs at `src/app/docs/api/page.tsx`.
   - **Analytics correctness:** overview route queries Message table directly for delivered/clicked (`status IN ('sent','delivered')` + `clickedAt`); channel stats now report `deliveryRate`/`clickRate`/`conversionRate`. Abandoned-cart job sets `deliveredAt` on success (fires EMAIL_COMMENT). Dashboard + analytics pages show message metrics & rate columns (RateBadge: ≥80% green / ≥50% yellow / >0 red / 0 grey). Campaign analytics, `/r/[id]` click tracking, and Shopify webhook attribution all query status IN (`sent`,`delivered`).
   - Verification: `npx tsc --noEmit`, `npm run lint`, `npx jest` (357 tests — added totp + api-key utils suites).
1. **Bargain storefront widget polish** (`src/components/bargain/BargainWidget.tsx`) — commit `35b3a088`
   - Merchant-safe suggested amount chips (derived from `maxDiscountPercent` cap, never near floor).
   - Escape-to-close on floating panel. Reduced-motion (`prefers-reduced-motion`) support.
2. **Merchant dashboard settings UI polish** (`src/app/dashboard/bargain/page.tsx`) — commit `0e285e22`
   - Grouped Config tab into Negotiation / Personality / Margin-protection sections w/ helper text + a GroupTitle helper.
3. **ROI calculator synced to real pricing** (`src/components/ROICalculator.tsx`) — commit `50ed9662`
   - Plans now match `src/lib/payment.ts::PLANS`: Free ₹0/50, Growth ₹1499/750 (rec), Pro ₹3999/3000, Enterprise Custom.
   - Recovery capped by plan cart allowance ("carts processed"). Added Bargain-gain metric + per-plan bargain sessions/deals.
   - Note: plan data is mirrored locally (client widget can't import server-only `payment.ts`); keep in sync.

## Key source locations
- **Pricing/plan source of truth (server):** `src/lib/payment.ts` (FREE_CARTS_THRESHOLD=50, PLAN_IDS, PLANS, getPlan, resolvePlanId, PAID_PLAN_IDS). Enterprise listed in PLANS but not in PAID_PLAN_IDS.
- **Plan limits → subscription status:** `src/lib/subscription.ts` (`getSubscriptionStatus`, planLimits: maxCarts / bargainSessions / bargainDeals / revShare, storesLimit). Duplicate/parallel logic in `src/lib/payments/` (adapters/recovery) — check both before editing limits.
- **ROI calculator:** `src/components/ROICalculator.tsx` (+ `src/app/api/ai/roi/route.ts`, consumers in `src/app/page.tsx`, `src/app/dashboard/*`).
- **Bargain engine / guards:** `src/lib/services/bargain.ts`, `src/lib/bargain/engine.ts` (ruleBasedDecision, retentionOffer, graduatedCounter, Persona, NegotiationContext), `src/lib/bargain/text.ts` (extractPrice, detectWalkout), `src/lib/bargain/i18n.ts` (8 langs), `src/lib/bargain/gate.ts`, `src/lib/bargain/abuse.ts`, `src/lib/bargain/__tests__/security.test.ts` (15 tests), `src/lib/rate-limit.ts` (`checkSimpleRateLimit(key)` single arg).
- **Storefront widget (production):** `src/components/bargain/BargainWidget.tsx` (embedded + floating, cg_resize postMessage handshake). Fallback/demo widget: `src/components/bargain/StorefrontBargainWidget.tsx`. Wrapper: `src/app/s/bargain/bargain-view.tsx`, embed page `src/app/bargain/embed/page.tsx`.
- **Merchant dashboard:** `src/app/dashboard/bargain/page.tsx` (Config/Products/Analytics/Logs/Demo tabs) + `demo-panel.tsx`.
- **Bargain APIs:** `src/app/api/bargain/start|offer|accept|config|products|sessions|demo/route.ts` (start/offer now call `logDataAccess`).
- **Interactive demo:** `src/app/demo/demo-content.tsx` (692 lines, one-session-per-account via `/api/demo/claim`), `src/components/HeroNegotiationDemo.tsx` (animated hero mockup), `src/lib/bargain/engine.ts` used by demo + `/api/bargain/demo`.
- **Auth (done, already built):** unified smart-email login `/login`, `POST /api/auth/check-email`, forgot/reset/verify-email pages.
- **PCD/compliance (done):** privacy / terms / dpa / security-policy pages live at 200; `logDataAccess` wired; privacy/tos in `shopify.app.toml`.

## State of the 25-point bargain spec — done
- 8 languages, premium CTA + chat UI, "playfully strict + friendly" personas, full negotiation states
  (idle/counter/accept/reject/abandon/expired), offer input + chips, accepted-deal celebration, mobile-first,
  accessibility (focus, ARIA, Esc-to-close, reduced-motion), lightweight/performant, merchant floor protection
  (never below min-price, never reveal floor), interactive demo + edge cases (low/good/multiple offers,
  merchant-protection refusal), embedded + floating widget, embed/cg_resize handshake.

## Open / next items (from our plan)
- **⛔ REQUIRED for live AI fallback:** user must add `AI_FALLBACK_API_KEY` (Groq key, free/no credit card, from console.groq.com/keys) in Vercel → Settings → Environment Variables (optionally `AI_FALLBACK_BASE_URL` / `AI_FALLBACK_MODEL`), then redeploy. Without it the app runs on heuristics; OpenAI stays degraded until the user recharges OpenAI credits (platform.openai.com billing).
- **`deliveredAt` semantics:** email/WhatsApp fire-and-forget → delivered = sent on success. If a real delivery status webhook/provider lands later, recompute delivered/clicked from provider callbacks, not send success.
- **Roi calculator / pricing:** effectively complete for current plans (see commit `50ed9662`), but
  `src/lib/payment.ts` has duplication with `src/lib/payments/` — flag before any limit change.
- **No other outstanding todos** — sed plan's remaining polish (dashboard UI, demo edge cases) was completed this session.

## Safe-to-touch guardrails
- Do NOT delete/break: recovery, auth, billing, Shopify integration, analytics, pricing, DB logic.
- Never hardcode merchant min-price in frontend; never expose merchant floor/margin/economics to customers.
- Keep ROI plan data in `ROICalculator.tsx` in sync with `payment.ts::PLANS`.
- Re-run tsc + lint + jest (357) before committing.
