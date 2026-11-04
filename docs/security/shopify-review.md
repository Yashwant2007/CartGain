# Shopify Protected Data Review Copy

## 200-word version
CartGain uses merchant and customer data only to deliver abandoned-cart recovery, AI price negotiation, Shopify Billing, support, and compliance functions. We minimize collection, restrict production access to a small authorized group, and record sensitive reads in audit logs. Customer-facing and merchant-facing messages are redacted so logs and alerts do not expose unnecessary personal data. Production and test environments are separated through distinct database configuration, and non-production systems must use `TEST_DATABASE_URL` rather than production data. We maintain a written data-loss-prevention policy that prohibits unmanaged exports, copying production data into ad hoc environments, or using customer data outside approved workflows. Backups are encrypted before storage, and restore tests are performed on a scheduled basis to verify recoverability. Operational controls are documented in the DPA, privacy policy, terms, backup policy, and DLP policy so merchants can understand how data is handled. These controls keep access limited, auditable, and proportionate to the service we provide.

## 255-character version
CartGain minimizes data use, isolates test and production systems, logs sensitive access, redacts alerts/logs, encrypts backups, and runs restore tests. We prohibit unmanaged exports and document these controls in our DPA, privacy, backup, and DLP policies.

## Why these scopes are requested

CartGain requests exactly four scopes:

- `read_orders` — reads abandoned checkouts, order webhooks, and refund webhooks used
  for recovery and refund-adjusted revenue.
- `read_customers` — resolves a missing recovery name and syncs customer identity
  (name/email/phone) for consent-aware reminders.
- `read_products` — reads product names, prices, images, and inventory for the bargain
  widget and product-aware recovery messages.
- `write_discounts` — creates one-use discount codes when a bargain is accepted or a
  recovery offer is issued.

The Admin API is GraphQL-only (`2026-04`). CartGain does not request or use checkout
scopes, order/customer/product write scopes, `read_all_orders`, product-listing scopes,
or deprecated webhook scopes. It never mutates a checkout, customer, order, or product.

We persist only email/phone/name, cart contents, consent provenance, and the
negotiation transcript. Billing/shipping contact names and phones may be read
transiently from an abandoned checkout to fill a missing recovery name/phone; street
addresses are neither queried nor persisted. App charges use Shopify Billing, not a
third-party payment gateway.
