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

- `feat(whatsapp): live delivery + a sweep that actually covers every store`.
  Root cause of the `(#100)` was **the recipient**: sending to our own business
  number (`+91 73558 49689`) is rejected; the same token and payload deliver to
  a normal number (`+918708718426`). The approved templates also declare an
  **IMAGE header**, so `(#132012) header: expected IMAGE, received UNKNOWN`
  hit every cart without a product photo — the sender now always sends a
  header, falling back to `WHATSAPP_TEMPLATE_HEADER_IMAGE_URL` (default
  `https://cart-gain.com/logo.png`). Working shape, verified with `wamid`:
  image header + 3 positional body params + url button, language `en`.
  `mode:"probe"` now tests exactly that and accepts a caller-supplied
  `accessToken`/`phoneNumberId`/`headerImageUrl`; `whoami` accepts `wabaId`
  (the phone-number node has no WABA field and `me/businesses` is empty for a
  system user that is not tied to a portfolio). Sweep reliability: one store
  per invocation starved everyone else whenever the trigger slipped (GitHub
  ran the 5-min schedule **once in 2.5h**), so `processAbandonedCarts` now
  processes as many campaigns as fit `CART_SWEEP_BUDGET_MS` (default 35s) and
  keeps a cursor only when the rotation was cut short. `POST /api/jobs/
  process-carts` no longer enqueues into a Bull queue that has no worker on
  Vercel (it returned "queued" and nothing drained it) — it processes inline
  like GET. The DB now stores the text actually sent (WhatsApp: stripped
  single-line body). Verified end to end: sweep answer
  `{"storesProcessed":3,"messagesSent":1}` and a WhatsApp row
  `status:"sent"` with a real `wamid`. Tests 104 suites / 1206.

- `fix(whatsapp): prove the send path is blocked by the token, not the
  payload`. `POST /api/jobs/test-whatsapp` gained `mode:"probe"` (text, body-only
  `en`, body-only `en_US`, named params, body+url button) and `whoami` now
  returns the phone-number id's own metadata plus `debug_token` scopes
  (`token.canSend`), `subscribed_apps`, and the WABA discovered by walking
  `me/businesses → owned_whatsapp_business_accounts → phone_numbers` (the
  phone-number node has no `whatsapp_business_account` field). Result: the
  number is healthy (`+91 73558 49689`, LIVE, name APPROVED, quality GREEN) and
  even a **plain text** message answers `(#100) Invalid parameter / OAuthException`
  → `WHATSAPP_BUSINESS_TOKEN` lacks `whatsapp_business_messaging` (it can still
  read the number). Fix belongs in Meta: regenerate a System-user token with
  `whatsapp_business_messaging` + `whatsapp_business_management` and reassign
  `WHATSAPP_BUSINESS_TOKEN` in Vercel. Code side: body parameters now support
  the NAMED template format (`WHATSAPP_TEMPLATE_PARAM_FORMAT=named`,
  `WHATSAPP_TEMPLATE_PARAM_NAMES=name,body,discount`) because WhatsApp Manager
  defaults new templates to `{{name}}/{{body}}/{{discount}}`. Prod DB check:
  email step 0 is `sent` with a Resend id, WhatsApp step 0/1 rows are `failed`
  (same 100) — so only the WhatsApp credential is missing.

- `feat(recovery): personal offers, no greeting stutter, template introspection`.
  The WhatsApp `{{3}}` offer line is now personalised: "<Name>, your <product>
  gets 10% off — code GAINxxxxxx: <checkout link> — or name your price:
  <bargain link>", and `{{2}}` no longer greets the customer a second time
  (the template already says `{{1}}`) via
  `stripLeadingGreeting` — "HURRY!! Priya, last chance ⏳ Hi Priya, ..." became
  "... Priya, your Sneaker gets 10% off". Email's coupon band is titled
  "<Name>'s personal offer". Prompt `recovery-v3` now asks for item-specific,
  concrete, lightly humorous copy (names the actual product, one reason to
  return, one clear next step) while the validator still blocks invented
  claims. `GET /api/jobs/test-whatsapp?mode=whoami` now also returns the WABA
  id and the approved template list (name/status/language/parameter_format),
  which is the fastest way to align template names and language codes.

- `fix(whatsapp): match the merchant's approved template names and button`.
  The approved WABA templates are `cart_reminders`, `cart_followup`,
  `cart_urgent` (English) with `{{1}}` name, `{{2}}` body, `{{3}}` offer and a
  DYNAMIC url button, plus the merchant's own static copy/footer. Code now
  defaults to those names (env-overridable) and sends the button suffix when
  `WHATSAPP_TEMPLATE_BUTTON_BASE` is set — it is set in production to
  `https://cart-gain.com/r/`. One compatibility retry translates opaque Meta
  errors: `132001` retries with `en_US`, `132000`/`131008` retries body-only.
  Graph API bumped to `v22.0` (v18 is sunset; it answers a bare `#100`), env
  values are stripped of quotes/whitespace/`Bearer `, and test-whatsapp gained
  `mode:"whoami"` (reads the phone number's own metadata) plus `mode:"text"`.
  Note: the approved static copy carries urgency ("HURRY", "last chance") —
  that is merchant-approved template text; our validator still forbids the
  model from inventing claims in `{{2}}`.

- `feat(analytics): wire the bargain funnel into the dashboard`. The
  `/api/analytics/bargain` endpoint (started → negotiated → offered → accepted →
  issued → purchased, average discount, end-to-end rate, revenue) was live but
  unused by the UI; the Analytics page now loads it alongside `overview` and
  renders the six stages with per-stage conversion, avg discount, purchase rate
  and bargain revenue. Endpoint failures never break the main analytics view.

- `fix(whatsapp): send only the components the approved template declares`.
  Recovery sends were passing a footer component (static footers must never be
  sent as parameters) and an image header whenever the cart had a product
  image; Meta rejects the whole message with `(#132000)` on any component the
  template does not declare. Header image is now opt-in
  (`WHATSAPP_TEMPLATE_IMAGE_HEADER=true`), the footer component is gone, and the
  URL button is still suffix-only behind `WHATSAPP_TEMPLATE_BUTTON_BASE`. New
  job-authenticated `POST /api/jobs/test-whatsapp` sends any of the three
  templates to a number and returns Meta's raw answer plus the component shape
  actually sent — use it to verify approval. CI workflow now calls GET so each
  run also syncs the store's abandoned checkouts.
- `feat(recovery): real offers, working links, WhatsApp templates and a live
  cart sweep`. Offers are resolved from merchant config *before* copy is
  written (`src/lib/recovery/offer.ts`): the campaign code when set, otherwise a
  real single-use Shopify discount minted for that cart (`GAIN<hash>`,
  deterministic/retry-safe, usageLimit 1, 7-day TTL); if Shopify can't create it
  the message ships with no offer instead of a fake code. The AI-invented
  "personalised discount" path is gone from the job. Every link is now a tracked
  `/r/<cartId>?c=<ch>&to=cart|bargain|checkout[&code=]` redirect
  (`src/lib/recovery/links.ts`, `src/app/r/[id]/route.ts`) that records the click
  then routes to the cart page, the bargain widget (`/cart/<id>?focus=bargain#bargain`,
  `BargainWidget defaultOpen`), or the store checkout with the code applied
  (`/discount/<code>?redirect=/cart/<token>`). Email got a coupon band + primary
  checkout CTA + "name your price" secondary CTA; WhatsApp templates now carry
  three never-empty variables (name, AI body, offer line with both links), no
  fabricated "last chance" text, suffix-only opt-in button, env-overridable
  names/language (`WHATSAPP_TEMPLATE_REMINDER|FOLLOWUP|FINAL|LANG|BUTTON_BASE`).
  Scheduling: Vercel **Hobby** rejects `*/5` crons (deploy fails), so
  `.github/workflows/process-carts.yml` pings `/api/jobs/process-carts` every 5
  minutes with `Authorization: Bearer $JOB_SECRET` — the repo secret must match
  the Vercel env var or the sweep never runs. Deployed `bc355ec`; live redirects
  verified (cart → 302 /cart, bargain → 302 ?focus=bargain#bargain, checkout →
  302 `https://<store>/discount/<code>?redirect=%2Fcart%2F<token>`). Tests:
  104 suites / 1200 tests, lint/tsc/build green.
- `feat(conversation): shared human-like copy layer, honest recovery, brand
  voice, truthful delivery/analytics`. New `src/lib/conversation/` — one voice
  model (`voice.ts` personas/emoji/humour/length/assertiveness/language/
  banned+approved phrases), trusted-fact contract (`facts.ts`), deterministic
  validator (`validate.ts`), stable variants + quiet hours (`variety.ts`),
  versioned facts-only prompts (`prompts.ts`), and a generator that validates
  model output, retries once, then falls back to a fact-only template
  (`generate.ts`). Recovery now composes through it (`recovery.ts`), so the old
  hardcoded prompts/fallbacks that invented "bestsellers", "everyone's obsessed",
  "selling out nationwide" and "last chance" are gone (`generateEmailContent`/
  `generateWhatsAppContent` deleted; `EmailTemplates.abandoned` de-fabricated).
  Brand voice API `GET/PUT/DELETE /api/merchant/config` + Settings → "Brand
  voice" tab (persona, emoji, humour, length, tone, language, vocabulary,
  sign-off, quiet hours). Data integrity: store-scoped unique indexes
  (`RecoveredCart(storeId, shopifyOrderId)`, `BargainSession(storeId,
  purchasedOrderId)`), store-scoped Redis dedupe key, store-scoped refund
  lookup, `Message(step, variant, providerId, promptVersion)` with
  `@@unique(cartId, channel, step)` + claim-before-send idempotency (stale
  pending rows retried, failed sends retryable at the same step). Delivery is
  now truthful: send = `sent`, `delivered` only from provider receipts (WhatsApp
  status webhook + new signed Resend webhook `/api/webhooks/email`); analytics
  delivery rate/chart revenue/avg conversion time/store attribution fixed
  (`status='delivered'`, net revenue by `recoveredAt`, DISTINCT ON per cart,
  explicit `storeId`). New `/api/analytics/bargain` funnel (started →
  negotiated → offered → accepted → code → purchased). Migration
  `20261021170000_store_scoped_orders_and_merchant_voice` applied. Tests: new
  `src/lib/conversation/__tests__/*`, email-webhook signature tests,
  delivery-rate + events store-scope tests → 98 suites / 1156 tests, lint, tsc,
  build green.
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
