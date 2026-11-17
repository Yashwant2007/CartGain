# 02 — Data Inventory and Minimization

## Collected

| Model | Personal data | Why it is needed | Retention |
|---|---|---|---|
| `Cart` | name, email, phone, Shopify customer id, cart token, items, value | Recover the abandoned cart; attribute orders | Contact + items cleared at 90 days; token pseudonymised; recovery URL cleared |
| `Message` | recipient contact via cart relation, body, delivery status, provider id | Delivery proof, retries, opt-out/support | Body + provider id redacted at 90 days; status counts retained |
| `CustomerIdentity` | email, phone, name, Shopify customer id, per-channel consent | Consent registry and suppression | While merchant active / consent needed |
| `OptOut` | email or phone, reason, timestamp | Legal suppression obligation | Indefinite while merchant active |
| `Customer` / `CustomerInsight` | email/phone, order aggregates, AI-derived intent | Merchant analytics/personalisation | Merchant account lifetime; redacted on customer redact |
| `BargainSession` / `BargainMessage` | email/phone, transcript, offers | The negotiation itself | Hard delete at 90 days |
| `RecoveredCart` | order attribution/value | Revenue reporting and billing | Revenue/tax retention (8 years) |
| `DataAccessLog` | actor id, action, resource id, redacted metadata | Security audit | 180 days |
| `CustomerDataExport` | DSR payload containing the customer's records | Fulfil `customers/data_request` | 180 days |

## Not collected

- Street/billing address in a durable model (checkout contact is used
  transiently and not persisted).
- Card numbers, bank details, government ids.
- Advertising identifiers or cross-site tracking.
- Precise geolocation.
- Voice recordings or support call recordings.

## Minimization controls in code

- Recovery AI facts exclude email, phone, address, cart/checkout tokens and
  recovery URL (`src/lib/conversation/facts.ts`, `prompts.ts`; test
  `recovery-minimization.test.ts`).
- DSR export no longer includes cart/checkout tokens (`src/lib/data-export.ts`).
- Logs use `redactSensitive()` and `logReference()` (SHA-256 prefix) instead of
  raw identifiers.
- The optional recovery-URL query is isolated so a Level 2 denial cannot widen
  access to other fields.
- Merchant-facing analytics show aggregates; no bulk CSV export exists for
  merchant campaign/customer data.
