# CartGain 2.0 — Implementation Map

Prepared 2026-11-17 after a full read-only audit of the bargain flow. This is
the working map for the 12-phase 2.0 upgrade. It identifies existing surfaces
so changes extend the current engine rather than duplicating it.

## 1. Storefront UI

| Surface | Files |
|---|---|
| Real storefront embed | `src/components/bargain/BargainWidget.tsx` |
| `/s/bargain` storefront widget | `src/components/bargain/StorefrontBargainWidget.tsx` |
| Shopkeeper stage/avatar/primitives | `src/components/bargain/ShopkeeperStage.tsx`, `ShopkeeperAvatar.tsx`, `BargainPrimitives.tsx`, `expressions.ts` |
| Pages/cart | `src/app/bargain/embed/page.tsx`, `src/app/s/bargain/page.tsx`, `src/app/cart/[id]/page.tsx`, `src/app/demo/demo-content.tsx` |
| Theme extension | `extensions/storefront-bargain/blocks/*.liquid`, `assets/bargain.js`, `assets/bargain.css` |
| Tests | `src/app/bargain/embed/__tests__/page.test.tsx`, `src/components/bargain/__tests__/*.test.tsx` |

Known issues: no `AbortController`/`signal`/`IntersectionObserver`, fake
`BARGAIN_...` codes rendered before server confirmation, invalid unitless CSS in
the widget's raw CSS string, whole-cart accept sends null product id and fails
server price verification, no stable request sequencing/dedupe, contradictory
price fields, no verified two-column desktop layout.

## 2. APIs and engine

| Surface | Files |
|---|---|
| Start/offer/accept | `src/app/api/bargain/start/route.ts`, `offer/route.ts`, `accept/route.ts`, `checkout-accept/route.ts` |
| Session/config/quote/recommendations | `src/app/api/bargain/session/[id]/route.ts`, `sessions/*`, `config`, `quote/[token]`, `products/*`, `recommend/event`, `experience/*` |
| Engine | `src/lib/services/bargain.ts`, `src/lib/bargain/engine.ts`, `offers.ts`, `goals.ts`, `discount.ts`, `policy.ts`, `gate.ts`, `offer-validation.ts`, `product-fetcher.ts`, `product-context.ts`, `conversation-state.ts`, `recommendations.ts`, `quote.ts`, `purchase.ts`, `claims.ts`, `abuse.ts`, `intent.ts`, `text.ts` |
| Validation | `src/lib/validation/bargain.ts` |
| Tests | `src/app/api/bargain/**/__tests__/*`, `src/lib/bargain/**/__tests__/*` |

Known issues: bundle path mints real codes without metering/attribution;
accept routes omit attempt-limit checks; `accept` does not enforce `expiredAt`;
accept expiry returns session timeout instead of code/quote expiry; checkout
accept bypasses emergency/config pause; `start` projects a stored discount code
to anonymous browsers; status enum drift (`accepting` written but not declared).

## 3. Shopify discount repair (P0)

| Surface | Files |
|---|---|
| Mutation builders | `src/lib/bargain/discount.ts:104-155`, `:240-272`; `src/lib/recovery/offer.ts:72-117` |
| Call sites | `src/app/api/bargain/accept/route.ts:338-350`, `checkout-accept/route.ts:292-303`, `src/lib/bargain/purchase.ts:135-148`, `offer/route.ts:408-419` |
| Checkout extension | `extensions/cart-gain-bargain/src/Checkout.jsx:330-347` |
| Scopes | `src/lib/shopify-oauth.ts:17-22`, `shopify.app.toml:75`, `shopify.app.custom.toml:78` |
| Tests | `src/lib/bargain/__tests__/discount.test.ts`, `src/lib/recovery/__tests__/offer.test.ts` |

Root causes for the reported GraphQL errors:

- Top-level `value` and `minimumSubtotal` on `DiscountCodeBasicInput` are not
  valid for API `2026-04`; they must be `customerGets.value` and
  `minimumRequirement.subtotal`.
- `customerGets.items.productVariants` is invalid; product/variant targeting is
  `customerGets.items.products.productVariantsToAdd`.
- Percentages were sent as `0-100`; Shopify expects `0.00-1.00`.
- Fixed amounts must be decimal strings such as `"125.00"`.
- Product ids were blindly wrapped in a Product GID; the checkout extension
  sends a ProductVariant GID in the `shopifyProductId` field.
- `pending` responses were treated as success and persisted as real codes.
- There is no DB uniqueness/idempotency for issued discount codes.

Official 2026-04 input shape was confirmed against Shopify docs:
`DiscountCodeBasicInput`, `DiscountItemsInput`, `DiscountProductsInput`,
`DiscountCustomerGetsValueInput`, `DiscountUserError`.

## 4. Data model, timers and deployment

| Surface | Files |
|---|---|
| Models | `prisma/schema.prisma` — `BargainSession` 552–621, `BargainQuote` 629–676, `BargainQuoteEvent` 680–694, `BargainMessage` 696–709, `BargainConfig` 429–529 |
| Migrations | `prisma/migrations/2026*` — quotes `20261113120000`, modules 3–8 `20261113130000`–`170000`, checkout URL `20261116120000` |
| Deployment | `vercel.json` — `bom1`, cron jobs, `maxDuration`; `.github/workflows/*` |
| Flags | `src/lib/feature-flags.ts` — `BARGAIN_QUOTE`, `BARGAIN_DUAL_AGENT` |
| Jobs | `src/app/api/jobs/*`, `src/lib/jobs/processBargainDealFollowups.ts`, learning finalization, retention |

Known issues: no unique constraint on issued codes; no DB-enforced state;
quotes lack declared FKs; `accept` has no expiry enforcement; schema/migration
drift exists for daily-goal tables and several config columns;
`/api/jobs/health-check` cron has no route.

## 5. AI performance and security

| Surface | Files |
|---|---|
| Provider | `src/lib/ai-client.ts`, `src/lib/ai-quota.ts` |
| Prompt/context | `src/lib/services/bargain.ts:249-927`, `:933-1040`, `:2475-2514`, `src/lib/bargain/product-context.ts`, `product-fetcher.ts` |
| Route lifecycle | `src/app/api/bargain/offer/route.ts:161-1263` |
| Telemetry | `src/lib/analytics/track.ts`, `src/lib/observability/logger.ts` |
| Security | `src/lib/rate-limit.ts`, `src/lib/bargain/session-bind.ts`, `src/lib/data-protection.ts`, auth helpers |

Known issues: no global provider deadline; worst case primary 10s + fallback
20s + primary retry 10s; `/offer` has no explicit `maxDuration`; server makes
duplicate product/floor reads; no p50/p95/p99 or client request timing; IP-only
rate limits on storefront endpoints. Security is otherwise server-authoritative
for price/floor and session ownership, with floor never sent to AI.

## 6. Implementation order

1. Repair Shopify 2026-04 discount mutation, decimal/GID handling, verification,
   idempotency and pending-policy; add tests.
2. Introduce one authoritative negotiation-state projection and enforce expiry,
   attempts, pause controls and code-ready semantics.
3. Rebuild the storefront UI shell with compact header, summary, chat, actions
   and composer; add responsive mobile/tablet/desktop layouts.
4. Fix chat reliability: request sequencing, AbortController, dedupe, optimistic
   messages, retry/recovery and independent scrolling with new-message hints.
5. Optimize AI latency with a global deadline, context reuse, stage timings and
   p50/p95/p99 telemetry.
6. Harden personalities/recommendations/security, then run full tests/build and
   verify production.

No requirement is considered complete without code, test or live evidence.
