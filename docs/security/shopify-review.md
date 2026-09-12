# Shopify Protected Data Review Copy

## 200-word version
RecoverFlow uses merchant and customer data only to deliver abandoned-cart recovery, subscription billing, support, and compliance functions. We minimize collection, restrict production access to a small authorized group, and record sensitive reads in audit logs. Customer-facing and merchant-facing messages are redacted so logs and alerts do not expose unnecessary personal data. Production and test environments are separated through distinct database configuration, and non-production systems must use `TEST_DATABASE_URL` rather than production data. We also maintain a written data-loss-prevention policy that prohibits unmanaged exports, copying production data into ad hoc environments, or using customer data outside approved workflows. Backups are encrypted before storage, and restore tests are performed on a scheduled basis to verify recoverability. Operational controls are documented in the DPA, privacy policy, terms, backup policy, and DLP policy so merchants can understand how data is handled. These controls are designed to keep access limited, auditable, and proportionate to the service we provide.

## 255-character version
RecoverFlow minimizes data use, isolates test and production systems, logs sensitive access, redacts alerts/logs, encrypts backups, and runs restore tests. We prohibit unmanaged exports and document these controls in our DPA, privacy, backup, and DLP policies.

## Why the app requests `write_checkouts` (questionnaire answer)
CartGain requests `write_checkouts` alongside `read_checkouts` for two reasons:
1. Shopify's abandoned-checkout REST endpoints (`GET /admin/api/*/abandoned_checkouts.json`) are documented for the checkouts resource, whose scopes are granted as the read/write pair — the read of shipping/billing address needed to detect and recover abandoned carts requires the checkout scope set.
2. The app's optional AI price-negotiation feature matches the storefront customer's `email` against prior bargain sessions (read-only) so returning visitors get a personalized, lower counter-offer. We never mutate a checkout; `write_checkouts` authorizes the scope set, and no cart is changed server-side.
We persist only email/phone/name (no addresses) and never use `write_checkouts` to alter checkout contents.
