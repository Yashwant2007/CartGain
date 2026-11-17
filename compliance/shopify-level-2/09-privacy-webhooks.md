# 09 — Mandatory Privacy Webhooks

Declared in `shopify.app.toml` / `shopify.app.custom.toml` as compliance topics;
registered by `shopify app deploy`, never at runtime.

All deliveries: body read → HMAC-SHA256 verify → payload/header domain match →
fast `200` acknowledgment → `waitUntil` processing. Invalid signatures return
`401`; unparseable signed payloads are acknowledged to stop retries; async
failures are persisted and alerted.

| Topic | Handler | Effect |
|---|---|---|
| `customers/data_request` | `handleCustomerDataRequest` | `collectCustomerData` → `CustomerDataExport` → email merchant → audit. Payload is not returned in the webhook response. |
| `customers/redact` | `handleCustomerRedact` | `redactCustomer(shop, id, email, phone)` removes carts/messages/recovered attribution/identities/opt-outs/bargain sessions/journeys/exports for that customer, matching by id or cart contact. |
| `shop/redact` | `handleShopRedact` | `purgeStoreData` removes store-scoped models, payments, analytics and Shopify audit rows, then deletes the store. |
| `app/uninstalled` | `handleAppUninstalled` | Same full purge. |

## Idempotency / retry behavior

- Redact and data-request handlers use delete/upsert operations that are safe to
  repeat. Shopify may retry a delivery; a duplicate cannot resurrect data.
- The HMAC covers only the body, so a captured body replayed with a different
  `X-Shopify-Shop-Domain` header is rejected (`payloadDomain !== header`).
- A failure after the fast `200` is captured in persisted error logs and sent to
  the operator alert channel. ⚠️ Shopify does not retry after that `200`; the
  operator must use the logged request details to re-run the export/redaction if
  needed.

## Evidence

- Code: `src/app/api/webhooks/shopify/route.ts`, `src/lib/data-deletion.ts`,
  `src/lib/data-export.ts`.
- Tests: webhook handler-contract/checkout-capture suites, data-export and
  data-deletion suites.
- ⚠️ Attach a Shopify Partner “webhook delivery” screenshot for a live store.
