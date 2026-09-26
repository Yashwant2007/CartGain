# ADR-006 — Shopify integration boundaries

## Context
Shopify is the primary channel: OAuth install, session tokens, product/shop
GraphQL, webhooks (orders/carts/uninstall), discount-code creation, Shopify
Billing subscriptions, plus storefront UI extensions.

## Decision
- **Isolation**: all Shopify HTTP lives behind `src/lib/shopify*` modules
  (`shopify-oauth.ts`, `shopify-graphql.ts`, `shopify-billing/*`, `shopify.ts`)
  with explicit adapters; route handlers stay thin (`api/shopify/*`, one event
  topic per async job).
- **Webhook identity**: every Shopify webhook verifies HMAC synchronously
  (`verifyShopifyWebhook`), acks 2xx fast, de-duplicates (Redis NX), and
  processes async per-topic with error capture + alerting.
- **Token hygiene**: store secrets are encrypted at rest (`encryption.ts`);
  refresh tokens rotate; uninstall triggers purge via `purgeStoreData` and the
  app disables the store.
- **API version**: version assumptions are centralized in the GraphQL client.

## Alternatives considered
- Scattering `fetch(shopify)` across features — rejected (unmaintainable,
  un-testable).
- Blocking webhooks until all work completes — rejected (Shopify retries
  inflate failure rate).

## Consequences
- New integrations must go through the adapters; webhook handlers must follow
  the verify → ack → enqueue pattern.

## Status
Accepted. Implemented.