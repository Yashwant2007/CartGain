# Final Verification — Shopify GraphQL Admin API Migration

**Date**: Nov 5, 2026
**State**: code complete, verified locally, and committed as `899831c7`; **not deployed**.

## 1. Admin API surface

- [x] `src/lib/shopify.ts` exposes `SHOPIFY_API_VERSION = '2026-04'` and
      `shopifyGraphQL()`; all Admin resource calls go through it.
- [x] Abandoned checkouts use `abandonedCheckouts` (open checkouts only).
- [x] Products/listings, product price/detail, and customer-name lookup use
      `products` / `customers`.
- [x] Product images use a GraphQL `product` query with Redis/memory caching.
- [x] OAuth callback reads the shop with GraphQL `shop { email shopOwnerName }`.
- [x] Shopify health uses GraphQL `shop { name }`.
- [x] `grep -R "admin/api" src | grep -v graphql.json` returns no Admin REST calls.
      The only non-GraphQL Admin URL is the OAuth token-exchange endpoint.

## 2. Webhooks

- [x] Functional + compliance topics are declared in `shopify.app.toml` and
      `shopify.app.custom.toml`.
- [x] Runtime webhook registration removed (`setupShopifyWebhooks`,
      `createShopifyWebhook`, `createShopifyWebhookIfMissing` deleted).
- [x] Compliance tests no longer assert a runtime/config sync path; HMAC `200/401`
      contract remains covered.

## 3. Scopes

- [x] `read_orders,read_customers,read_products,write_discounts` in runtime OAuth,
      both TOML files, and both env examples.
- [x] Removed checkout, all-orders, product-listing, and deprecated webhook scopes.

## 4. Billing

- [x] Paid plans use Shopify Billing subscriptions + capped app usage records.
- [x] Razorpay remains only as a legacy cancellation path.
- [x] USD prices/caps remain explicit `[REQUIRES CONFIRMATION]` placeholders.

## 5. Documentation

- [x] `SHOPIFY_APP_STORE.md` — current scopes, GraphQL-only API, Shopify Billing,
      corrected pricing, WhatsApp/email-only listing copy.
- [x] `docs/shopify-app-store.md` — submission kit aligned to the code.
- [x] `docs/shopify-custom-distribution.md` — no runtime webhook registration; custom
      apps cannot use Shopify Billing.
- [x] `SHOPIFY_PROTECTED_DATA_READINESS.md` — GraphQL data flow, consent, scopes, and
      protected-field request (name/email/phone; no address persistence).
- [x] `docs/security/shopify-review.md` — current four-scope questionnaire answer.

## 6. Local verification

```
npm run typecheck   ✅
npm run lint        ✅ no warnings or errors
npm test            ✅ 145 suites / 1554 tests
npm run build       ✅ production build
```

## 7. Not yet verified

- Live Shopify 2026-04 GraphQL schema responses against a connected store.
- A fresh OAuth install with the four-scope set.
- Live webhook delivery after `shopify app deploy`.
- Shopify Billing subscribe/cancel against a development store.
- Production deploy and `/api/health` release check.
