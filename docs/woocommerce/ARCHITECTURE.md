# WooCommerce architecture

CartGain supports Shopify and WooCommerce through one additive platform layer. The Shopify path remains authoritative and unchanged: OAuth, GraphQL Admin API, checkout links, discount creation, and Shopify webhooks continue to use the existing code.

## Layers

- `src/lib/platforms`: platform-neutral adapter contracts and registry.
- `src/lib/woocommerce`: WooCommerce REST adapter, URL/SSRF validation, normalization, signature verification, event processing, recovery offers, bargain adapter, and service/control-plane operations.
- `src/app/api/integrations/woocommerce`: merchant-authenticated connection lifecycle and signed plugin control-plane endpoints.
- `src/app/api/webhooks/woocommerce`: signed event ingestion.
- `plugins/cartgain-woocommerce`: installable WordPress plugin that captures carts, customer consent, orders, and product changes and forwards signed events.

## Data model

The migration `20261120130000_add_woocommerce_integration` is additive:

- `Store`: `externalStoreId`, `platformStatus`, `platformConnectedAt`, `platformLastSyncAt`.
- `Cart`: generic `platform`, `platformCartId`, `platformOrderId`, `externalCustomerId`, `platformStatus`.
- `RecoveredCart`, `BargainProduct`, `BargainSession`, `BargainPurchaseMemory`, `CustomerIdentity`: generic platform identifiers so a WooCommerce order/product/customer is a first-class equivalent of Shopify data.
- `PlatformConnection`, `PlatformCredential`, `ConnectionIntent`, `PlatformEvent`, `PlatformProduct`, `PlatformOrder`, `WebhookDelivery`: platform-neutral records for connection state, encrypted keys, replay-safe events, catalog/order mirrors, and delivery auditing.

All new tables enable Postgres row-level security with no public role policies; application access goes through Prisma/server-only code.

## Event flow

1. The plugin captures Store API/cart/checkout/customer/order/product changes in a local DB queue.
2. It POSTs signed events to `/api/webhooks/woocommerce` (or product push payloads to `/sync/products`).
3. The server verifies HMAC, timestamp, connection id, and store id; deduplicates via `PlatformEvent`; then writes to the existing `Cart`, `CustomerIdentity`, `PlatformOrder`, and related models.
4. Existing `processAbandonedCarts`, `processRecoveryJourneys`, bargain routes, analytics, and retention jobs read those same models. No second recovery engine is introduced.

## Bargain and recovery

- Product facts and hidden floors resolve through the generic adapter; WooCommerce product ids/variant ids are stored alongside Shopify ids.
- A WooCommerce store uses a WooCommerce coupon in place of a Shopify discount code. Checkout URLs point to the store’s cart/checkout with the coupon applied where supported.
- Recovery consent from the plugin is explicit; only recognized consent sources with timestamps create `CustomerIdentity` consent flags.
- Server-side pricing authority remains in the bargain engine. The plugin never receives hidden floors or server secrets.

## Security invariants

- Store URLs must be public HTTPS and pass private-address/DNS checks.
- Consumer keys/secrets and webhook secrets are encrypted at rest; fingerprints replace raw values in status responses.
- Connection intent codes are single-use and expire in 10 minutes.
- Plugin events and plugin control-plane calls are HMAC-signed with timestamp tolerance.
- Secrets are never returned to browsers, written to localStorage, or logged.
