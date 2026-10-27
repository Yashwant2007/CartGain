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

- `feat(bargain): storefront performance analytics, publish history, and
  verified refund netting`. Completed the Atlas V2 measurement/safety gaps
  without changing the negotiation engine or pricing path. New
  `BargainExperienceEvent` stores only allow-listed presentation events
  (`invitation_impression`, `invitation_click`, `chat_open`); design and
  personality are resolved from the published snapshot server-side, the client
  cannot attribute a variant, preview/dev/preview-deploy traffic is ignored,
  duplicate beacon ids are idempotent, and events are retained 180 days by the
  retention job. Qualified impressions require 50% visibility for 800ms and are
  locally de-duplicated for 12h per visitor/product/design/version; clicks and
  one chat-open per widget mount complete the funnel. `BargainSession` now
  snapshots `experienceDesign`, `experiencePersonality`, `experienceVersion`,
  and `experienceVisitorKey` at start, but only when a published experience
  exists, so legacy direct-chat stores stay `unknown` instead of being assigned
  to a design. Publish/rollback: `BargainExperiencePublish` keeps the latest 20
  snapshots, draft writes accept `expectedDraftVersion` and answer 409 instead
  of overwriting another tab, publish/rollback/defaults append history inside a
  transaction, and the Studio has a rollback table. `/api/analytics/bargain`
  now returns storefront impressions/clicks/chat-opens, CTR, click→chat,
  chat→session, design and personality comparisons (session snapshot, with
  insufficient/directional/sufficient evidence thresholds), gross vs net
  revenue, refunds, fully refunded purchases, and attribution notes. The new
  Bargain → Storefront Performance tab renders the funnel, metrics, comparison
  tables, and explicit empty/error states. Refunds/cancellations now net
  `BargainSession.purchaseValue` against frozen `purchaseGrossValue` through an
  idempotent refund-event ledger, update `purchaseRefundStatus`, reverse
  pending rev-share/accruals, and decrement the purchase-day analytics row
  exactly once; invoiced events are never silently mutated. Migrations
  `20261027150000_add_experience_analytics_and_history` and
  `20261027160000_add_bargain_purchase_netting` are applied to production.
  Verified: Jest **128 suites / 1413 tests**, tsc, lint, and production build
  green. Local production smoke still needs the deployed release; Shopify
  extension activation remains a separate check.

- `feat(bargain): storefront experience studio with three shopkeepers, four
  invitations, and reactive avatars`. Added an additive `BargainConfig`
  experience layer while keeping the existing prompt/pricing path authoritative.
  Personalities `friendly_shopkeeper`, `strict_shopkeeper`, and
  `playful_shopkeeper` map onto the existing engine personas
  (`friendly_shopkeeper`, `strict_negotiator`, `playful_friend`) and add
  bounded prompt guidance only; legacy `aiPersona` stores keep their prior
  behavior until they publish an experience. `src/lib/bargain/experience/`
  now owns validated types/defaults, legacy-compatible config mapping,
  draft/published snapshots, avatar event-to-expression mapping, and personality
  prompt guidance. Merchants get `GET/PUT/POST /api/merchant/bargain-experience`
  plus a Settings → Bargain Experience tab with live invitation/avatar preview,
  personality and design galleries, copy/CTA/accent/size/position controls,
  draft save, publish, and restore defaults. Draft edits are stored in
  `experienceDraft`; only Publish copies them to `experiencePublished` and
  mirrors the flat columns read by storefront/engine paths. `BargainWidget`
  renders `ShopkeeperAvatar` in the chat header, maps chat/counter/accept/reject/
  error/session events to expressions, and shows `StorefrontInvitation` before
  the first chat turn for merchants with a published experience (existing
  merchants keep the direct-chat drawer). Four designs: `smart-assistant`,
  `playful-bargain-club`, `unlock-your-deal`, `human-shopkeeper`; reduced-motion
  and avatar/motion toggles respected. Migration
  `20261027120000_add_bargain_experience_studio` is applied to production
  (JSONB snapshots + 15 flat columns verified); an earlier `migrate dev` shadow
  replay failed on old `BargainRevenueShareEvent`, so the additive SQL migration
  was created/applied directly. Verified: Jest **126 suites / 1399 tests**, tsc,
  lint, production build; local public `/api/bargain/experience` returned the
  published defaults 200 and the merchant endpoint returned 401 unauthenticated.
  Committed `a5dcdb99` and deployed; `/api/health.release` is `a5dcdb9` with
  DB/Redis/env/AI/email/WhatsApp checks ok. Production public experience returns
  the published defaults (200), the merchant endpoint is 401 unauthenticated,
  and the embed returns 200. The route integration test covers auth, draft-only
  writes, publish mirroring, defaults, and ownership fallback.

- `feat(bargain): claim checks, merchant negotiation styles, and learning
  quarantine`. Added a deterministic truth layer (`src/lib/bargain/claims.ts`)
  that classifies customer claims across competitor prices, prior purchases/
  promises, order proof, product features, listed prices, promotions, inventory,
  policy and merchant authorization. The taxonomy is now
  verified/supported/unverified/contradicted/outdated/ambiguous/unverifiable/
  malicious, and every claim carries provenance (`source`, `scope`, `verified`,
  `evidenceVersion`). The prompt gets a compact untrusted-claim block; raw
  hostile text is never echoed and product contradictions use verified product
  data / `disallowedClaims` (arbitrary merchant phrases included). Added
  `src/lib/bargain/merchant-modes.ts` with six merchant styles
  (`friendly_playful`, `professional_premium`, `firm_negotiator`, `value_first`,
  `budget_advisor`, `strict_policy`) and three abuse tolerances
  (`lenient`/`standard`/`strict`), exposed in the Bargain dashboard. Style
  guidance is additive only when `BargainConfig.negotiationStyle` is set, so
  existing merchants keep their exact prior behavior; strictness only changes
  repeated-abuse escalation, never the security checks. `abuse.ts` gained a
  pure `classifyManipulationRisk` plus strike escalation for profanity/
  jailbreak/injection/exfiltration, including manager/owner authority claims.
  Learning integrity: manipulation on an `/offer` or demo turn sets
  `BargainSession.learningQuarantined`, skips arm selection, writes outcomes
  with `reward=0` for audit, reverses stats if a session was previously trained,
  and never blocks a verified purchase attribution. A new
  `learning/integrity.ts` gate rejects missing scope/keys, cross-tenant
  sessions, production/demo environment mismatches, demo commercial outcomes
  and invalid strategies; manipulation is quarantined, not globally rejected.
  `/offer` and demo also write no-raw-text `quarantined` audit events (claim
  category/status/provenance only). Schema/migration
  `20261026140000_add_bargain_modal_safety_integrity` adds
  `BargainConfig.negotiationStyle/abuseStrictness`,
  `BargainSession.learningQuarantined`, `BargainLearningOutcome.quarantined`,
  and is applied to production (columns verified, 8 configs intact). Verified:
  Jest **124 suites / 1381 tests**, tsc, lint and production build green.
  Committed as `115011ce` and deployed to Vercel; `/api/health.release` is
  `115011c`, DB/Redis/env/AI/email are ok, and `whatsapp.appSecret` is now true
  (inbound webhooks no longer 401). The three new API routes return 401
  unauthenticated. A docs-only AGENTS update follows the runtime deploy.

- `feat(bargain): adaptive negotiation learning layer end to end`. Added the
  additive `BargainLearning*` schema (config, events, outcomes, arm stats,
  audit) plus `BargainSession.environment/learning*` fields; migration
  `20261026130000_add_bargain_learning_agent` is applied to production. The
  engine stays authoritative: learning adds a bounded internal prompt block and
  a ±5% counter nudge clamped above the hidden floor, never a new pricing path.
  New pure modules `src/lib/bargain/learning/{types,strategies,features,reward,
  selector}.ts` cover eligibility, context bucketing, refund-aware rewards and a
  deterministic Thompson selector with a global fallback, trust threshold and
  exploration cap. Server modules `service.ts` and `outcomes.ts` fail open when
  the models/Redis are unavailable, keep shadow selections untrained, and make
  event/outcome writes idempotent. `/api/bargain/offer` selects once on the
  first meaningful turn (not on generic chat), persists the arm, and records
  turn evidence; demo uses an isolated `environment='demo'` partition and a
  stable client `learningSessionId`. Accept, purchase attribution, Shopify
  refunds/cancellations and a daily finalization job settle outcomes; the job
  runs from `vercel.json` plus a GitHub fallback workflow. Merchant controls:
  `GET/POST/DELETE /api/merchant/bargain-learning` (validated, audit-logged,
  store-scoped) and Settings → “Bargain learning” with shadow/active mode,
  strategy allow/block lists, reward weights and evidence table. Retention:
  learning events honour per-store `eventRetentionDays` (default 180),
  outcomes/session-linked data are pruned at 90 days, and deletion/export now
  include the new models. Verified: `prisma validate`, migration deploy, Jest
  **122 suites / 1350 tests**, tsc, lint and production build green; deployed to
  Vercel (health `ok`, DB/Redis/AI/email ok; `whatsapp.appSecret` still false).
  Seeded default config rows for the existing 8 stores: live learning stays off
  (`enabled=false`, `shadowMode=true`) while `/demo` learning is on. Live smoke
  test with a temporary verified merchant: the authenticated config GET answered
  `configured:false, mode:baseline`, POST saved config, `/api/bargain/demo`
  returned a demo-mode selection and persisted two learning events plus
  `__global__`/context arm pulls; the temporary user/store was deleted
  (`provider=db`, cascade cleanup verified). Demo turns record pull evidence
  only, so demo arms gain no purchase reward and can explore but will not become
  “trusted” until real storefront purchases settle outcomes. The working tree is
  still uncommitted, so `/api/health.release` remains `5ebce39`.

- `feat(recovery): consent-gated WhatsApp recipients, retries, and template
  formatting`. Added a `CustomerIdentity` recipient registry (explicit
  `consentWhatsApp`/`consentEmail`, provenance timestamps, sticky suppression),
  a fail-closed eligibility gate (`src/lib/recovery/eligibility.ts`), and the
  job now loads consent for the batch once, skips suppressed/opted-out carts on
  BOTH channels, and never sends WhatsApp without an identity. Failed sends get
  exponential backoff (`attempts`, `lastAttemptAt`, 5 tries / 5m base / 6h cap,
  env `RECOVERY_MAX_SEND_ATTEMPTS`/`RECOVERY_RETRY_BASE_MS`) and an atomic
  claim (`message.updateMany` on the previous status) prevents duplicate sends.
  STOP persists OptOut rows for email AND phone, cancels pending work, and
  suppresses the identity; START records explicit consent. Inbound opt-in
  keywords are narrowed to START/UNSTOP/SUBSCRIBE/OPTIN/OPT-IN/OPT IN (ambiguous
  "yes/agree" removed). Shopify `customers/create|update` sync identities and
  order-create cancels pending recovery. New dashboard `/dashboard/recipients`
  + `/api/recipients` + `/api/integrations/whatsapp` let a merchant see consent
  and map the store's WhatsApp phone-number id (needed for inbound STOP/START).
  WhatsApp formatting: `src/lib/recovery/offer-line.ts` builds the `{{3}}`
  offer line (name, product, discount, code, checkout URL, bargain URL) with
  bounded product text so neither URL is ever truncated; `{{1}}` name and
  `{{2}}` AI body are whitespace-normalised and `{{`-escaped. Template send
  now resolves `WHATSAPP_BUSINESS_TOKEN` / `WHATSAPP_ACCESS_TOKEN` /
  `META_WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` / `META_PHONE_NUMBER_ID`
  through `src/lib/whatsapp/config.ts`. Tests pin: component order
  header→body→button, positional vs named (`name,body,discount`) params, both
  links and their order, non-empty params, whitespace/URL preservation, image
  fallback, alias credentials, email font stack/viewport/CTA order. Jest 116
  suites / 1300 tests, tsc, lint, build green. Migration
  `20261026000000_recipient_consent_and_send_attempts` is now applied to the
  production Supabase DB, and the code is live on Vercel (`/api/health` release
  `5ebce39`, database ok, `whatsapp.configured: true`). Local `.env` still has
  placeholder WhatsApp values (token length 7, phone `1234…`) so live Meta
  calls must use the Vercel env.

- `fix(recovery): the WhatsApp header is the product photo, and a reminder
  round hits WhatsApp AND email`. Two real bugs, found by auditing the path
  instead of the UI: (a) Shopify sends the line-item photo as `image_url`
  (`checkouts/*` and the REST sync) but both capture mappers read only
  `image?.src || image`, so every cart stored `image: undefined` and the
  mandatory template header fell back to `https://cart-gain.com/logo.png`;
  (b) the job sent at most one message per cart per sweep and counted every
  accepted message as a "step", so a two-channel campaign reminded on
  WhatsApp and pushed the email hours later — and single-channel campaigns
  were capped at exactly one message because the budget was
  `min(channels, maxFollowUps + 1)`. Now `src/lib/shopify-line-items.ts`
  normalises `image_url` / `image.src` / gid ids / product_id / variant_id /
  sku for both capture paths; `src/lib/recovery/product-image.ts` resolves a
  missing photo from `GET products/{id}.json` (Redis + in-memory cache, 7d,
  401 never cached), the job persists the resolved photo onto the cart items
  so later rounds and the email reuse it, and the sender retries once with
  the fallback image only when Meta rejects the photo (131053/132012).
  Image headers are on by default (the approved templates declare one).
  Steps are now ROUNDS: a round is complete only when every reachable
  channel has an accepted message for it, idempotency is per
  (channel, round), and `maxRounds = maxFollowUps` (1..5). Verified live with
  a synthetic cart (product id + no image): the log line said
  `[recovery] cart=… whatsapp header=product-photo`, the WhatsApp wamid
  arrived with the snowboard photo, the cart items were persisted with the
  Shopify CDN URL, and the email for the same round was `delivered` via the
  Resend webhook (providerId `01a163e4-…`) — the first real proof that the
  email receipt path works end to end. `Message(step)` remains 0/0 for the
  two channels. Tests 109 suites / 1235. **Still missing:**
  `WHATSAPP_APP_SECRET` is unset, so Meta's inbound/status webhooks are
  answered 401 (delivery receipts and STOP replies never land) — set it from
  Meta → App settings → Basic. `/api/health.checks.whatsapp` now reports
  `appSecret` / `verifyToken` booleans.

- `feat(jobs): dual trigger — Supabase pg_cron drives the sweep, GitHub is the
  fallback`. Vercel **Hobby rejects any sub-daily cron** (`*/5` fails the
  deploy: "Hobby accounts are limited to daily cron jobs"), and GitHub's
  scheduler ran the 5-minute workflow **once in 4 hours**. The production
  database (Supabase, PG 17) now runs the sweep for real: extensions
  `pg_cron` + `pg_net` created, the job secret stored with `vault.create_secret`
  (never in `cron.job`), and `public.cartgain_sweep()` (SECURITY DEFINER)
  issues `net.http_get('https://cart-gain.com/api/jobs/process-carts')` with
  the Bearer header and a 120s timeout. `cron.schedule('cartgain-sweep',
  '*/5 * * * *', 'select public.cartgain_sweep()')` fired on time and the
  endpoint answered 200. `cron.schedule('cartgain-net-cleanup', '25 3 * * *')`
  prunes `net._http_response` after 2 days. Both triggers hit the same route,
  so `claimSweepSlot()` (`src/lib/jobs/sweep-slot.ts`, Redis `SET NX`,
  4-minute TTL) makes the second one a 200 `{"status":"skipped"}` instead of a
  duplicate sweep — and it still runs when Redis is absent/down. The GitHub
  workflow stays as-is for the case where the DB/job is paused. Do not put the
  5-minute cron back in `vercel.json` until the Vercel project is on Pro.

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
- Storefront invitations only replace the direct-chat drawer after a merchant
  publishes an experience (`experiencePublished` exists). Draft-only stores keep
  the prior behavior on purpose; the dashboard preview uses the draft and emits
  no telemetry.
- Experience analytics only count published storefronts. A design table can be
  empty while the session funnel has data (pre-experience sessions are grouped
  under `unknown` by design/personality); that is expected, not no data.
- New stores do not get a `BargainLearningConfig` row automatically, so
  `/demo` learning stays off for them until the merchant opens Settings →
  Bargain learning and saves (the existing 8 stores were seeded). Production
  learning is deliberately off until enabled there.
- WhatsApp inbound is unblocked: production `/api/health` now reports
  `checks.whatsapp.appSecret: true` with `verifyToken` and `configured` true
  (secret set in Vercel). Local `.env` WhatsApp credentials are still
  placeholders, not the live Meta token.
- Partner Dashboard "App Bridge from CDN" / "session tokens" checks are only
  confirmed by Shopify's scanner (it loads the app in the admin iframe); the
  code side is verified (script + meta served in `<head>`, token exchanged via
  `/api/shopify/embed-auth`), the dashboard verdict still has to be observed.
- `fetchShopifyCarts` (`/admin/api/2026-04/carts.json`) is not a real Shopify REST
  resource and is only referenced by tests (`shopify-retry.test.ts`); production
  cart sync uses `syncAbandonedCheckouts`. Fix it if it's ever wired in.
- `/demo` real code/details only engage when the signed-in merchant has a connected
  Shopify store; new-signup accounts get sample products + sample codes.
