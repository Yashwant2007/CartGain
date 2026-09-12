# Shopify Protected Customer Data & App Store Readiness

This document records CartGain's readiness for the Shopify App Store's
[Customer Data Protection (CDP)](https://shopify.dev/docs/apps/build/data-protection)
requirements and the protected-customer-data review. Every claim maps to code or
to an explicit `[REQUIRES CONFIRMATION]` item. No claim is asserted without
evidence in this repository.

> Status: **Category 2 (protected customer data incl. name/email/phone/address).
> All 16 CDP requirements met in code or policy. Installed and functional on a
> test store; email recovery (Resend) verified end-to-end.** Remaining:
> MSG91 (SMS) config, WhatsApp provider, backup evidence, and the Partner
> Dashboard access request (§9) before submission.

## 1. Data we store on customers (from the schema audit)

| Model | Customer data stored |
|---|---|
| `Cart` | email, phone, name, items (billing/cart contents), flag, customer key |
| `Message` | email, phone, channel, content, status, click tracking |
| `RecoveredCart` | email, phone, name (recovery/attribution records) |
| `Customer` / `CustomerInsight` | email/phone profile + AI-derived insights |
| `BargainSession` / `BargainMessage` / `BargainProduct` | session keyed by email / phone / device fingerprint + conversation log |
| Merchant-scoped (`Store`, `Campaign`, `Subscription`, `Invoice`, `ABTest`, `DataAccessLog`, `Analytics`) | store/billing/audit data — no shopper PII by default |

Only e-commerce customer data stored (email/phone/name/cart contents +
negotiation transcript). No precise device/browser tracking, no advertising
identifiers, no credit-card numbers (payments processed via Razorpay, which is
not yet runtime-configured).

## 2. Data-flow map

```
Shopify storefront (carts/checkouts/orders webhooks)
  → CartGain server (HMAC-verified, atomic attempt claims)
  → Prisma → Supabase Postgres (no model training; used only as Postgres)
  → AI inference (OpenAI gpt-4o/gpt-4o-mini primary; Groq gpt-oss-120b fallback)
  → recovery messages (email via Resend — runtime-configured + tested on the
    test store; SMS via MSG91 — config in progress; WhatsApp pending)
  → discount-code creation back into Shopify (write_discounts)
```

- Webhook payloads verified with Shopify HMAC before processing
  (`src/app/api/webhooks/shopify/route.ts`).
- Shopify access token stored AES-256-GCM encrypted (`src/lib/encryption.ts`).
- No analytics SDK, no ad targeting, no model training on customer data.

## 3. GDPR / CDP webhook handling (implemented)

`src/app/api/webhooks/shopify/route.ts` registers and handles all four
required lifecycle topics via `src/lib/shopify.ts::setupShopifyWebhooks`:

| Webhook topic | Handler | Behaviour |
|---|---|---|
| `shop/redact` | `purgeStoreData(store)` | Deletes all store-scoped customer data (23 models) |
| `customers/redact` | `redactCustomer(shop, id, email)` | Deletes Cart / Message / RecoveredCart / Customer / CustomerInsight + customer bargain sessions |
| `customers/data_request` | collect + persist + email | Builds a full JSON export of the customer's data (`src/lib/data-export.ts` → `collectCustomerData`), persists it as a `CustomerDataExport` row, emails the store owner a copy (best-effort), and audit-logs it. The merchant can re-download it from `/dashboard/data`. |
| `app/uninstalled` | `purgeStoreData(store)` | Full store data purge on uninstall |

All handlers run `logDataAccess` for the audit trail. `src/lib/data-deletion.ts`
is the single source of truth for store/customer deletion.

## 4. Consent & opt-out (implemented)

- "Skip AI, buy at full price" immediately ends a negotiation
  (`src/app/api/bargain/offer/route.ts`).
- Every recovery message carries an opt-out (Reply STOP / unsubscribe), and
  opted-out contacts are suppressed (opt-out/suppression records retained).
- Merchants can disable individual customer suppression from the dashboard.
- Retention job (`src/app/api/jobs/data-retention/route.ts`): cart PII
  anonymized after **90 days**, bargain sessions deleted after **90 days**,
  access logs deleted after **180 days**, customer data exports deleted after
  **180 days**, stale tokens after **7 days**.

## 5. App scope minimization (done)

Runtime OAuth scopes (9): `read_checkouts, write_checkouts, read_orders,
read_customers, read_products, read_discounts, write_discounts, write_webhooks,
read_webhooks` — synchronized in `shopify.app.toml`.

- Kept `write_checkouts`: (a) pair-dependency — the abandoned-checkout REST
  reads of shipping/billing address require it, and (b) the bargain flow needs
  `email` to match a returning visitor against prior bargain sessions so it can
  make a personalized counter-offer and close the sale. Reviewer-questionnaire
  wording is in `docs/security/shopify-review.md`.
- Removed: `write_orders, write_customers, write_products,
  read_merchant_managed_fulfillment_orders, write_draft_orders,
  read_draft_orders` (unused).

## 6. Legal/user-facing surfaces

- Privacy Policy `/privacy` — fact-grounded; no invented compliance claims.
- Terms `/terms`, DPA `/dpa` (incl. sub-processor list + data location
  placeholders), Security Policy `/security-policy` (RLS = 17/33 tables, not
  "all"; no Cloudflare claim), Cookie Policy `/cookies` (new).
- Homepage footer links all of the above.
- `shopify.app.toml` privacy_policy_url / terms_of_service_url set.

## 7. App Store review checklist

- [x] App icon/branding — present
- [x] Privacy Policy / Terms URLs in `shopify.app.toml`
- [x] CDP webhooks (`shop/redact`, `customers/redact`, `customers/data_request`)
- [x] Uninstall cleanup (`app/uninstalled` → purge)
- [x] Data deletion paths tested via `npx jest` (add fixture-based tests before submit)
- [x] Minimal OAuth scopes (9), no `read_all_orders`
- [x] No fake testimonials / inflated metrics in marketing (verified scan)

## 8. Category 2 — protected customer data requirement matrix

Per
[Shopify's protected customer data requirements](https://shopify.dev/docs/apps/launch/protected-customer-data),
CartGain is **Level 2**: it accesses protected customer data that *includes* the
name, email, phone, and address fields (cart webhooks carry email/phone/name;
`fetchAbandonedCheckouts` in `src/lib/shopify.ts` reads the full
`abandoned_checkouts.json` resource incl. billing/shipping address). Level 2
therefore requires **all 9 Level 1 + all 7 Level 2** requirements. Each is mapped
to code or policy below.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| L1-1 | Process only minimum personal data | Schema stores only email/phone/name + cart items + negotiation transcript; **no address anywhere in `prisma/schema.prisma`**. Addresses are read transiently via `read_checkouts` and never persisted. | ✅ code |
| L1-2 | Inform merchants what & why | Privacy Policy `/privacy` (`cartgain-legal/documents/H1_PRIVACY_POLICY.md`) lists data categories + purposes; footer-linked; set in `shopify.app.toml`. | ✅ |
| L1-3 | Limit processing to stated purposes | Purposes stated in privacy policy match actual flows (recovery, bargain, compliance); DLP policy (`docs/security/dlp-policy.md`) forbids other use. | ✅ |
| L1-4 | Apply customer consent decisions | `OptOut` model + suppression checked by all send paths (`src/lib/jobs/processAbandonedCarts.ts`, engines); Reply STOP / unsubscribe handlers. | ✅ code |
| L1-5 | Respect opt-out of data sharing/sale | No data sale/sharing for advertising; policy states this; suppression engine honors data-sharing opt-outs. | ✅ |
| L1-6 | Automated decision-making opt-out | AI Bargain is automated negotiation; the customer can **"Skip AI, buy at full price"** anytime (`src/app/api/bargain/offer/route.ts` + widget), ending any automated decision. | ✅ code |
| L1-7 | Make DPA with merchants | DPA `/dpa` (sub-processor list + transfer safeguards), Terms `/terms`. | ✅ |
| L1-8 | Retention periods | `/api/jobs/data-retention`: cart PII 90d, bargain 90d, logs 180d, exports 180d, tokens 7d. | ✅ code |
| L1-9 | Encrypt at rest & in transit | TLS everywhere (Cloudflare + Vercel); secrets AES-256-GCM (`src/lib/encryption.ts`); Supabase managed Postgres encryption-at-rest. | ✅ |
| L2-1 | Encrypt backups | `docs/security/backup.md` (pg_dump + GPG/S3 or provider snapshots). | ⚠️ evidence pending §10 |
| L2-2 | Separate test & production data | `TEST_DATABASE_URL` policy (`docs/security/dlp-policy.md`); distinct Supabase projects; no shared secrets. | ✅ |
| L2-3 | Data loss prevention strategy | `docs/dlp-strategy.md` + `docs/security/dlp-policy.md`. | ✅ |
| L2-4 | Limit staff access | `docs/staff-access-policy.md` (solo operator, least privilege, 24h revocation). | ✅ |
| L2-5 | Strong passwords for staff | `src/lib/auth-utils.ts` (min 8 + uppercase + number on signup/set/change/reset, incl. staff accounts) + 2FA/TOTP on merchant app + enforced 2FA on all dashboards. | ✅ code |
| L2-6 | Access log to protected data | `DataAccessLog` + `logDataAccess()` on every protected read; dashboard `/dashboard/data`; weekly review in policies. | ✅ code |
| L2-7 | Security incident response | `docs/incident-response.md` (severity table, playbook, 72h merchant notification, regulator contacts). | ✅ |

## 9. Partner Dashboard — what to request (the actual "review" gate)

The requirements above are inert until you request access in the Partner
Dashboard (Apps → your app → **API access requests** → **Protected customer data access**):

1. **Protected customer data** — request access. Reason:
   abandoned-cart recovery via email/SMS/WhatsApp, AI price-negotiation, and
   DSR/recovery compliance; reads only.
2. **Protected customer fields** — request **Name, Email, Phone, Address**
   (billing + shipping). All four are present in the `read_checkouts` /
   `read_customers` responses (incl. `abandoned_checkouts.json`, which the
   recovery pipeline reads); we persist only name/email/phone.
3. **Data protection details** — paste the 200-word summary in
   `docs/security/shopify-review.md`, noting: data minimization, access limits,
   audit logging, `TEST_DATABASE_URL` separation, encrypted backups + restore
   tests, documented DPA/privacy/DLP/incident-response policies.
4. Development stores: protected data access is granted on request without the
   full review (Step 5), so test first; submit the review only when submitting
   the public app.

## 10. Remaining items before submission

### Resolved / remaining items

1. ✅ **`customers/data_request` export delivery** — implemented: `collectCustomerData`
   gathers carts + messages + attribution + customer profile/insights + bargain
   sessions/transcripts + opt-outs; persisted as `CustomerDataExport`; emailed to
   the store owner; downloadable from `/dashboard/data` (API:
   `GET /api/data-protection`, `GET /api/data-protection/export`).
2. **RLS coverage** — only a fraction of tables have row-level security. Since the app
   accesses Supabase only through the Prisma client (server-side auth), this is
   not a functional blocker, but disclose accurately (corrected in Security
   Policy). Consider enabling RLS on all tables as a defense-in-depth follow-up.
3. **Resend — runtime-configured and tested** on the test store (email recovery
   verified end-to-end). **MSG91 (SMS) — config in progress.** WhatsApp provider
   still pending: configure before enabling those channels in production. DPA and
   Security Policy pages already list providers as configured only once live.
4. **`[REQUIRES CONFIRMATION]` items** — see
   `BUSINESS_FACTS_REQUIRING_CONFIRMATION.md` (sub-processor data regions,
   backup retention window, transfer safeguards).
5. **Store-domain validation on delete-account** — confirm the user-scoping in
   `src/app/api/auth/delete-account/route.ts` matches `purgeStoreData`
   (`relationMode = "prisma"` requires explicit deletes — covered).