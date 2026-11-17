# 06 — Audit Logging

`DataAccessLog` (`prisma/schema.prisma`) records actor type/id, action, resource
type/id, purpose, redacted metadata and timestamp. `logDataAccess()` in
`src/lib/data-protection.ts` is the single writer.

## What is logged

| Event | Location |
|---|---|
| Shopify cart/checkout capture | `src/app/api/webhooks/shopify/route.ts` |
| Recovery URL access/denial (status counts only) | `src/lib/shopify.ts` |
| Bargain start/offer | `src/app/api/bargain/start/route.ts`, `offer/route.ts` |
| Merchant cart list/timeline reads | `src/app/api/carts/route.ts`, `carts/[id]/timeline/route.ts` |
| Merchant recipient list | `src/app/api/recipients/route.ts` |
| Merchant bargain session list/transcript | `src/app/api/bargain/sessions/*` |
| Data-protection dashboard + DSR download | `src/app/api/data-protection/*` |
| Customer redact / data request / store purge | `src/app/api/webhooks/shopify/route.ts`, `src/lib/data-deletion.ts`, `src/lib/data-export.ts` |
| RTO/payment sensitive operations | `src/lib/rto/nudge.ts`, `src/lib/payments/recovery.ts` |

## Properties

- Metadata is passed through `redactSensitive()` before write: emails, phones,
  tokens, secrets, message/body/cart/items/customer keys are masked.
- Recovery observability records only store id, access state, status counts and
  denial reason — never the URL.
- Audited reads are returned to the merchant at `/dashboard/data`.
- Retention: 180 days, then hard delete by the data-retention job. `shop/redact`
  removes owner audit rows tied to Shopify activity.

## Honest limitations

- The table is append-only by application convention, not by a database
  append-only role or WORM storage. ⚠️ A DB role restriction is an operator /
  infrastructure task.
- `DataAccessLog` has no `storeId`; merchant audit reads are scoped by
  `actorId` (the owner). That is correct for the current single-owner model but
  would need `storeId` before multi-staff stores.
- Write failures are caught so a logging outage cannot break recovery; they are
  emitted to the error log. ⚠️ Monitor for `Failed to write data access log`.
