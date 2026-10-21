# AGENTS.md — project memory for CARTGAIN / recoverflow

Durable notes for agents working in this repo. Read this before starting work.

## What this is
CartGain — a Next.js 14.2 (App Router) + TypeScript + Prisma/Postgres SaaS for
cart recovery + an AI "bargain" (negotiation) widget that installs into Shopify
stores. Deploys on Vercel (`https://cart-gain.com`). Branch: `master`.
Remote: `https://github.com/Yashwant2007/CartGain.git`.

Platform: Windows (win32), shell is bash (Git Bash). Working dir:
`C:\Users\Yashwant\Desktop\recoverflow`.

## Commands
- Dev: `npm run dev` · Test: `npm test` (jest) · Typecheck: `npm run typecheck`
  (`tsc --noEmit`) · Lint: `npm run lint` (`next lint`) ·
  Build: `npm run build` (`prisma generate && next build`).
- Targeted tests: `npx jest src/lib/bargain src/app/api/bargain`.
- Deploy web: `vercel --prod --yes` (aliases `https://cart-gain.com`; ~3 min).
  Verify live: `curl -s https://cart-gain.com/api/health` → `"release"` must equal
  `git rev-parse --short HEAD`. Health also checks db/redis/env/ai/email.
- Deploy Shopify extension: `shopify app deploy --allow-updates --message "…"`
  (builds + releases; success = "New version released to users"). No prompt.

## Conventions & gotchas
- Commit style: `type(scope): description` (lowercase, imperative).
- Shell is broken for commit messages containing `"` or `₹`. Write the message to
  a file and use `git commit -F <file>` (temp path:
  `C:/Users/DEEPAN~1/AppData/Local/Temp/opencode/commit-*.txt`).
- Shopify CLI churns the **tracked** `extensions/cart-gain-bargain/dist/*`
  (checkout ext). ALWAYS `git checkout -- extensions/cart-gain-bargain/dist/`
  after a Shopify build/deploy. Never commit that churn.
- Prefer `--silent` / piping `head`/`tail` on noisy commands.
- Vercel deploy env: DB + Redis must be reachable; `/api/health` `env.missing`
  should be `[]`.

## Shopify / billing facts
- Shopify CLI authed as `cartgain192007@gmail.com` (org `224514645`).
- Public app: title `CARTGAIN`, apiKey `67beb1794fab10553102c134b63e1277`, app id
  `gid://shopify/App/390792151041`; config `shopify.app.toml`.
- Custom app: client_id `850b64332c8925413d0d6d8d39ede515`
  (`shopify.app.custom.toml`, app `CartGain Custom`, `custom.cart-gain.com`).
- API version in use across `src/lib/shopify.ts`: `2026-04`.

## Bargain system map (key files)
- `src/lib/services/bargain.ts` (~2755 lines) — negotiation engine: personas,
  `negotiateStep`, `ruleBasedDecision`, `buildSystemPrompt`, `COMPACT_MASTERY`
  (~line 896), `NEGOTIATION_MASTERY` (~line 212), `computeMinPrice` (~1548).
- `src/lib/bargain/text.ts` — `extractPrice` (complaint-aware), `detectWalkout`.
- `src/lib/bargain/intent.ts` — `analyzeIntent`, `IntentAnalysis.priceComplaint`,
  `shopperIntentToPromptBlock`.
- `src/lib/bargain/recommendations.ts` — `searchRecommendations`,
  `recommendationReason`; verified, sanitized catalog cards.
- `src/lib/bargain/offers.ts` — `buildQuickOffers` (chips; never floor-derived).
- `src/lib/bargain/engine.ts`, `goals.ts`, `discount.ts`, `product-fetcher.ts`,
  `gate.ts`, `policy.ts`, `offer-validation.ts`.
- `src/lib/shopify.ts` — Shopify REST helpers (`fetchShopifyProducts`,
  `fetchAbandonedCheckouts`, `syncAbandonedCheckouts`, OAuth/token refresh).
- Routes: `src/app/api/bargain/{offer,demo,checkout-accept,config,products,
  products/catalog,accept,recommend/event}`.
- UI: `BargainWidget.tsx` (1997 lines, real storefront embed `/bargain/embed`),
  `StorefrontBargainWidget.tsx` (used by `/s/bargain`), `BargainPrimitives.tsx`
  (shared presentational primitives), `src/app/demo/demo-content.tsx` (`/demo`).
- `extensions/storefront-bargain/blocks/*.liquid` — theme extension app blocks.

## Work log (most recent first)
- `fix(shopify): initialize App Bridge script and attach Bearer session tokens`.
  Root cause of the embedded-auth failures: the ID-token validator compared the
  token's `dest` claim (the SHOP origin, e.g. `https://shop.myshopify.com`)
  with our own app origin, so every valid token was rejected. Shopify's spec
  (docs "ID tokens") is `iss=https://{shop}.myshopify.com/admin`,
  `dest=https://{shop}.myshopify.com`, and the two hostnames must match — the
  validator now enforces that, plus `aud` against the client id, and takes an
  optional `expectedShop`. Client side: `shopify.idToken()` blocks for 60s when
  the admin never answers, so the lookup is bounded (4s bridge wait + 6s token
  timeout, 10s cache, in-flight dedupe) and every same-origin `/api` request
  carries `Authorization: Bearer <id token>` — dashboard pages use
  `shopifySessionFetch`, a global `fetch` patch covers plain `fetch()` calls.
  A 401 answered with `X-Shopify-Retry-Invalid-Session-Request` triggers one
  retry with a fresh token (Shopify's documented contract) and the API routes
  now set that header on their 401s. The App Bridge bundle additionally gets
  the shop and admin host as `shopify-shop` / `shopify-host` meta tags, so the
  runtime survives navigations that drop the query string. The install route
  keeps embedded failures inside the app frame (`/login?error=…`) instead of
  dropping the merchant on the static marketing site.
- `ad9b26df` fix(shopify): App Bridge now loads for SIGNED-IN merchants and the
  session token is always exchanged. Root cause: next-auth's `withAuth` returns
  `undefined` for an authorized request (it only returns a response when it
  redirects), so the middleware's `if (response)` branch — the one that
  forwards the embed request header — never ran for a logged-in merchant and
  the App Bridge runtime was missing from the app UI. The middleware now builds
  the response itself when `withAuth` returns nothing. Second fix: the
  session-token exchange only ran while logged out, so no token was ever sent
  once signed in; the bootstrap now exchanges it in every embedded context and
  the embed-auth route refuses to swap the session of a different account.
  Verified locally with a signed session cookie: embedded `/dashboard` has the
  CDN script + `shopify-api-key` meta, non-embedded `/dashboard` and the
  public site have neither. Deployed, live release `ad9b26d`.
- `4849605a` feat(shopify): App Bridge from the Shopify CDN + session-token auth
  (Partner Dashboard requirements). The CDN bundle aborts unless the tag is a
  plain blocking `<script>` on Shopify's CDN and unless `shopify-api-key` +
  `shop` config exist, so the script is now server-rendered into `<head>` for
  embedded requests only (`src/app/layout.tsx` + `src/middleware.ts`:
  `?shop=*.myshopify.com` → `x-shopify-embed` request header). Public routes
  moved into `src/app/(site)/` with `force-static` so the marketing site stays
  static; `/login` and `/setup` stay outside it (dynamic) so an embedded
  merchant can be signed in with `shopify.idToken()`. Auth redirects now keep
  `?shop`/`?host`. Session-token verification checks `iss`/`dest`/`aud`.
  Verified live: release `4849605`, `/api/health` `shopify.apiKeyFingerprint`
  `aa96ee963d36` (= public app `67beb1794fab10553102c134b63e1277`),
  `appBridgeReady: true`, embedded login HTML has the meta + CDN script,
  public pages have neither.
- `5e357075` fix(shopify): abandoned-checkouts endpoint. `fetchAbandonedCheckouts`
  was calling a nonexistent `.../abandoned_checkouts.json` (key
  `abandoned_checkouts`) → 404 every cart sweep. Now uses `checkouts.json` /
  `data.checkouts`; non-401 failures log a warning (401 = reconnect). Deployed,
  live release `5e35707`, health ok.
- `bf26374d` feat(bargain): (a) complaint parsing — a bare complaint number
  ("714 is too much") is no longer read as the shopper's bid (`extractPrice`,
  `analyzeIntent.priceComplaint`, demo route re-derives offer, prompt no-bid +
  professional-tone bullets); (b) `/demo` storefront parity — quick-offer chips,
  delivered ticks, verified product details + server-side real floor, real
  recommendation cards, and a real one-use discount code via `checkout-accept`
  when a Shopify store is connected (sample fallback otherwise). tsc/lint clean,
  bargain jest group 590 passed, production `next build` ok.
- `9bc8209e` fix(theme-extension): migrate bargain block schema
  `"templates": […]` → `"enabled_on": { "templates": […] }`; released public app
  version `cartgain-36`.
- `84bebbba` Overhaul unified pricing: universal message caps (email 3 / WhatsApp
  2), campaign limits (Free 1 / Growth 5 / Pro 15 / Enterprise ∞), automatic paid
  overage incl. cart overage; removed `/api/subscription/overage`; `shouldInvoice()`
  extracted. Live/verified.

## Open / watch items
- Partner Dashboard "App Bridge from CDN" / "session tokens" checks are only
  confirmed by Shopify's scanner (it loads the app in the admin iframe); the
  code side is verified (script + meta served in `<head>`, token exchanged via
  `/api/shopify/embed-auth`), the dashboard verdict still has to be observed.
- `fetchShopifyCarts` (`/admin/api/2026-04/carts.json`) is not a real Shopify REST
  resource and is only referenced by tests (`shopify-retry.test.ts`); production
  cart sync uses `syncAbandonedCheckouts`. Fix it if it's ever wired in.
- `/demo` real code/details only engage when the signed-in merchant has a connected
  Shopify store; new-signup accounts get sample products + sample codes.
