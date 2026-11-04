# Shopify Protected Customer Data & App Store Readiness

This document records CartGain's readiness for the Shopify App Store's
[Customer Data Protection (CDP)](https://shopify.dev/docs/apps/build/data-protection)
requirements and the protected-customer-data review. Every claim maps to code or
policy, or is explicitly marked pending/`[REQUIRES CONFIRMATION]`.

> Status: **Category 2 readiness (protected customer data: name, email, phone).
> Code and policy are complete; the Dev Dashboard access request, backup evidence,
> and a fresh live-store verification remain before submission.** CartGain does not
> query or persist street addresses.

## 1. Customer data stored

| Model | Customer data stored |
|---|---|
| `Cart` | email, phone, name, cart items, customer key |
| `Message` | email, phone, channel, content, status, click tracking |
| `RecoveredCart` | email, phone, name, attribution records |
| `CustomerIdentity` | email/phone, per-channel consent and provenance |
| `Customer` / `CustomerInsight` | email/phone profile plus AI-derived insights |
| `BargainSession` / `BargainMessage` / `BargainProduct` | session keyed by email/phone/device fingerprint plus conversation log |
| Merchant-scoped (`Store`, `Campaign`, `Subscription`, `Invoice`, `ABTest`, `DataAccessLog`, `Analytics`, learning tables) | store/billing/audit data; no shopper PII by default |

Stored shopper data is limited to email/phone/name, cart contents, and the negotiation
transcript. No precise device tracking, advertising identifiers, or card numbers are
stored. Card data never reaches CartGain; Shopify Billing handles app charges.

## 2. Data flow

```
Shopify storefront (carts/checkouts/orders webhooks)
  → CartGain server (HMAC-verified, atomic send claims)
  → Prisma → Supabase Postgres (Postgres only; no model training)
  → AI inference (OpenAI primary; Groq fallback)
  → recovery messages (email via Resend; WhatsApp via Meta Cloud API)
  → discount-code creation back into Shopify (write_discounts)
  → Shopify Billing for subscriptions and capped usage charges
```

- Admin API access is **GraphQL-only** (`2026-04`): abandoned checkouts, products,
  customers, discounts, billing, and image lookup.
- Webhook payloads are verified with Shopify HMAC before processing
  (`src/app/api/webhooks/shopify/route.ts`).
- Shopify access tokens are AES-256-GCM encrypted (`src/lib/encryption.ts`).
- No analytics SDK, ad targeting, or model training on customer data.

## 3. GDPR / CDP webhook handling

The three mandatory topics are declared in `shopify.app.toml` and
`shopify.app.custom.toml` with `compliance_topics`; `shopify app deploy` registers
them. The runtime deliberately does **not** create webhooks through the Admin API.

| Webhook topic | Handler | Behaviour |
|---|---|---|
| `shop/redact` | `purgeStoreData(store)` | Deletes store-scoped customer data |
| `customers/redact` | `redactCustomer(shop, id, email)` | Deletes carts/messages/recovery/customer data and customer bargain sessions |
| `customers/data_request` | collect + persist + email | Builds a JSON export with `collectCustomerData`, stores a `CustomerDataExport`, emails the store owner, and audit-logs it. The merchant can download it from `/dashboard/data`. |
| `app/uninstalled` | `purgeStoreData(store)` | Full store data purge on uninstall |

All handlers call `logDataAccess` for the audit trail. `src/lib/data-deletion.ts`
is the single source of truth for store/customer deletion.

## 4. Consent and opt-out

- "Skip AI, buy at full price" ends a negotiation
  (`src/app/api/bargain/offer/route.ts`).
- Recovery requires explicit per-channel consent. Email needs `consentEmail`; WhatsApp
  needs `consentWhatsApp` plus a consented identity phone.
- STOP/unsubscribe is honoured by every send path; suppression records are retained.
- Storefront capture and the checkout UI extension collect explicit email/WhatsApp
  consent; the public opt-in route resolves product context server-side.
- Retention job (`src/app/api/jobs/data-retention/route.ts`): cart PII anonymized after
  **90 days**, bargain sessions deleted after **90 days**, access logs deleted after
  **180 days**, customer data exports after **180 days**, stale tokens after **7 days**.

## 5. Scope minimization

Runtime OAuth scopes:
`read_orders,read_customers,read_products,write_discounts` — synchronized across
`src/lib/shopify-oauth.ts`, `shopify.app.toml`, and `shopify.app.custom.toml`.

- `read_orders` — abandoned checkouts, orders, and refund webhooks.
- `read_customers` — resolve a missing recovery name and sync customer identity.
- `read_products` — product details, images, and prices for the bargain widget.
- `write_discounts` — create one-use bargain/recovery discount codes.

Not requested: checkout scopes, order/customer/product write scopes, discount reads,
product listings, fulfillment, draft orders, `read_all_orders`, and the deprecated
webhook scopes. The app does not mutate checkouts; the previous `write_checkouts`
questionnaire answer no longer applies.

## 6. Legal and user-facing surfaces

- Privacy Policy `/privacy` — fact-grounded, no invented compliance claims.
- Terms `/terms`, DPA `/dpa` (sub-processors + data locations), Security Policy
  `/security-policy`, Cookie Policy `/cookies`.
- Homepage footer links all of the above.
- Privacy/terms URLs live in the Dev Dashboard; Shopify CLI rejects them in
  `shopify.app.toml`.

## 7. App Store review checklist

- [x] App icon/branding present.
- [x] CDP webhooks declared and handled.
- [x] Uninstall cleanup (`app/uninstalled` → purge).
- [x] Data deletion/export paths have Jest coverage.
- [x] Minimum OAuth scopes; no `read_all_orders`, checkout, or write scopes beyond discounts.
- [x] GraphQL Admin API only; no REST Admin resource calls.
- [x] Webhooks registered by app config, not at runtime.
- [x] Shopify Billing for subscriptions; no non-Shopify app charges.
- [ ] Protected customer data access approved in the Dev Dashboard.
- [ ] Backup encryption/restore evidence attached.
- [ ] Fresh live-store install, consent, recovery, and billing smoke test.

## 8. Category 2 requirement matrix

CartGain is **Level 2**: it accesses protected customer data including name, email, and
phone. It reads transient billing/shipping contact name/phone from the abandoned
checkout but does not query or persist street addresses.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| L1-1 | Process only minimum personal data | Schema stores email/phone/name + cart items + transcript; no street address model or field. Address name/phone are used transiently and not persisted. | ✅ code |
| L1-2 | Inform merchants what and why | `/privacy` lists categories and purposes; footer-linked. | ✅ |
| L1-3 | Limit processing to stated purposes | Flows match policy; DLP policy forbids other use. | ✅ |
| L1-4 | Apply customer consent decisions | `CustomerIdentity` consent fields + `OptOut` suppression checked by all send paths. | ✅ code |
| L1-5 | Respect opt-out of data sharing/sale | No data sale/sharing for advertising; suppression honoured. | ✅ |
| L1-6 | Automated decision-making opt-out | "Skip AI, buy at full price" ends negotiation. | ✅ code |
| L1-7 | Make DPA with merchants | `/dpa` and `/terms`. | ✅ |
| L1-8 | Retention periods | `/api/jobs/data-retention` (90/90/180/180/7 days). | ✅ code |
| L1-9 | Encrypt at rest and in transit | TLS, AES-256-GCM secrets, Supabase managed encryption. | ✅ |
| L2-1 | Encrypt backups | `docs/security/backup.md`; attach restore evidence. | ⚠️ evidence pending |
| L2-2 | Separate test and production data | `TEST_DATABASE_URL` policy; distinct databases/secrets. | ✅ |
| L2-3 | Data loss prevention strategy | `docs/dlp-strategy.md` + `docs/security/dlp-policy.md`. | ✅ |
| L2-4 | Limit staff access | `docs/staff-access-policy.md`. | ✅ |
| L2-5 | Strong staff passwords | `src/lib/auth-utils.ts` + 2FA/TOTP enforcement. | ✅ code |
| L2-6 | Access log to protected data | `DataAccessLog` + `logDataAccess()`; dashboard `/dashboard/data`. | ✅ code |
| L2-7 | Security incident response | `docs/incident-response.md`. | ✅ |

## 9. Dev Dashboard — what to request

Apps → your app → **API access requests** → **Protected customer data access**:

1. **Protected customer data** — request access for abandoned-cart recovery, AI price
   negotiation, and data-subject/recovery compliance. Reads only.
2. **Protected customer fields** — request **Name, Email, Phone**. CartGain does not
   query or persist street addresses, so do not request address fields unless the code
   changes.
3. **Data protection details** — use the summary in
   `docs/security/shopify-review.md`; mention data minimization, access limits, audit
   logging, `TEST_DATABASE_URL` separation, encrypted backups + restore tests, and the
   DPA/privacy/DLP/incident-response policies.
4. Development stores can receive protected data access on request before the full
   review. Verify there first, then submit the public app review.

## 10. Remaining items before submission

1. ✅ `customers/data_request` export — implemented and downloadable from `/dashboard/data`.
2. **RLS coverage** — only a fraction of tables have row-level security. The app reaches
   Supabase through the server-side Prisma client, but disclose coverage accurately and
   consider enabling RLS everywhere as defense in depth.
3. **Provider configuration** — Resend email is runtime-configured and verified; WhatsApp
   is configured (with Meta's 24h-window limitation for marketing templates). There is
   no SMS channel.
4. **`[REQUIRES CONFIRMATION]` items** — see
   `BUSINESS_FACTS_REQUIRING_CONFIRMATION.md` (sub-processor regions, backup retention,
   transfer safeguards, USD billing prices/caps).
5. **Store-domain validation on delete-account** — keep the user-scoping in
   `src/app/api/auth/delete-account/route.ts` aligned with `purgeStoreData`
   (`relationMode = "prisma"` requires explicit deletes).
6. **Backup evidence** — attach encrypted-backup and restore-test evidence to the
   protected-data review.

---

*Last updated: Nov 4, 2026.*
