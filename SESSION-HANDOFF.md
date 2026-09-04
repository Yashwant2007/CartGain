# Session Handoff — CartGain (RecoverFlow)

> **How to resume:** just tell me "Have a look at `SESSION-HANDOFF.md`" and I'll read this file to get back on the same page.

Last updated: Fri Sep 04 2026

## Where we are
Rebuilding/upgrading the **CartGain AI Bargain System** as a flagship premium conversion feature
(storefront widget + merchant dashboard + interactive demo). All existing functionality (recovery,
auth, billing, Shopify, analytics, pricing, PCD compliance) is preserved — do not regress it.

- **Branch:** `master` — all work committed, pushed, and deployed to **https://cart-gain.com** (HTTP 200).

## Repo facts / working conventions
- Stack: Next.js (App Router) + NextAuth v4 (JWT) + Prisma + Razorpay.
- Env files: `.env`, `.env.local` (gitignored). Prod DB not queryable locally (no creds).
- Deploys: `npx vercel --prod --yes` (aliases to `cart-gain.com`). Local curl sometimes hits transient DNS → 000; verify via deploy output / `vercel ls`.
- Verification commands: `npx tsc --noEmit`, `npm run lint`, `npx jest` (345 tests green).
- Commit style: lowercase, concise, e.g. `bargain dash: group config settings into ...`.

## Most recent work (this session) — all committed & deployed
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
- **Roi calculator / pricing:** effectively complete for current plans (see commit `50ed9662`), but
  `src/lib/payment.ts` has duplication with `src/lib/payments/` — flag before any limit change.
- **No other outstanding todos** — sed plan's remaining polish (dashboard UI, demo edge cases) was completed this session.

## Safe-to-touch guardrails
- Do NOT delete/break: recovery, auth, billing, Shopify integration, analytics, pricing, DB logic.
- Never hardcode merchant min-price in frontend; never expose merchant floor/margin/economics to customers.
- Keep ROI plan data in `ROICalculator.tsx` in sync with `payment.ts::PLANS`.
- Re-run tsc + lint + jest (345) before committing.
