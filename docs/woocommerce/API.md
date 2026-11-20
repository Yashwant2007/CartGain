# WooCommerce HTTP contract

All endpoints are under `/api`. Merchant-session endpoints use the signed-in CartGain account. Plugin control-plane calls use the same HMAC scheme with `X-CartGain-Connection-Id`, `X-CartGain-Store-Id`, `X-CartGain-Timestamp`, and `X-CartGain-Signature`.

## Merchant control plane

- `POST /integrations/woocommerce/connect` — creates a 10-minute single-use connection intent. Body: `{ "installId"?: string }`.
- `GET /integrations/woocommerce/status` — connection state, webhook configuration, credential fingerprint, health, counts.
- `GET /integrations/woocommerce/health` — live health check against the plugin REST endpoint and WooCommerce REST API.
- `POST /integrations/woocommerce/disconnect` — revokes remote keys when possible, marks the connection revoked, clears secrets.
- `POST /integrations/woocommerce/sync/products` — pulls products/variations from WooCommerce REST, or accepts signed plugin payloads shaped `{ "products": [...] }`.
- `POST /integrations/woocommerce/sync/orders` — pulls orders/customers from WooCommerce REST.

## Unauthenticated exchange

- `POST /integrations/woocommerce/exchange` — called once by the WordPress plugin with the short-lived connection code, install id, proof, store URL, and WooCommerce consumer key/secret. Verifies the credentials against WooCommerce before persisting them.

## Event ingestion

- `POST /webhooks/woocommerce` — signed, deduplicated event envelope:

```json
{
  "eventId": "uuid",
  "type": "cart_abandoned|order_paid|customer_identified|...",
  "occurredAt": "2026-11-20T12:00:00.000Z",
  "connectionId": "...",
  "data": {}
}
```

Webhook signature canonical string: `${timestamp}.${rawBody}`.

Plugin control-plane signature canonical string: `${timestamp}.${storeId}.${path}`.

## Plugin REST endpoints

Hosted by the WordPress plugin:

- `GET /wp-json/cartgain/v1/health` — signed health probe.
- `POST /wp-json/cartgain/v1/events` — nonce-protected Store API cart/checkout/customer events.
- `POST /wp-json/cartgain/v1/consent` — nonce-protected explicit email/WhatsApp consent.
