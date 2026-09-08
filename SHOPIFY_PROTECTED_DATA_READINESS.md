# Shopify Protected Customer Data & App Store Readiness

This document records CartGain's readiness for the Shopify App Store's
[Customer Data Protection (CDP)](https://shopify.dev/docs/apps/build/data-protection)
requirements and the protected-customer-data review. Every claim maps to code or
to an explicit `[REQUIRES CONFIRMATION]` item. No claim is asserted without
evidence in this repository.

> Status: **code-level review complete.** Blockers / confirmations listed at the
> bottom of this file must be resolved before submission.

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
  → recovery messages (email/SMS/WhatsApp; providers not yet runtime-configured)
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
| `customers/data_request` | acknowledge + audit log | Logs the request via `logDataAccess`; full export delivered to merchant (see TODO below) |
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
  access logs deleted after **180 days**, stale tokens after **7 days**.

## 5. App scope minimization (done)

Runtime OAuth scopes (9): `read_checkouts, write_checkouts, read_orders,
read_customers, read_products, read_discounts, write_discounts, write_webhooks,
read_webhooks` — synchronized in `shopify.app.toml`.

- Kept `write_checkouts`: required for the abandoned-checkout REST reads of
  shipping/billing address (pair dependency). Optional improvement below.
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

### Blockers / must-fix or confirm before submission

1. **`customers/data_request` export delivery TODO** — the webhook acknowledges
   + audit-logs the request, but there is no automated email/export mechanism
   yet to deliver a machine-readable copy to the merchant. The Shopify guidance
   expects a response; today's handler returns success promptly without leaking
   customer data in the response body. Decide: implement programmatic delivery
   or document manual fulfillment from the dashboard before launch.
2. **RLS coverage** — only 17/33 tables have row-level security. Since the app
   accesses Supabase only through the Prisma client (server-side auth), this is
   not a functional blocker, but disclose accurately (corrected in Security
   Policy). Consider enabling RLS on all tables as a defense-in-depth follow-up.
3. **Resend / MSG91 / WhatsApp / Razorpay not runtime-configured** — legal and
   DPA/security pages already mark these "not runtime-configured". Configure
   before enabling those channels in production.
4. **`[REQUIRES CONFIRMATION]` items** — see
   `BUSINESS_FACTS_REQUIRING_CONFIRMATION.md` (sub-processor data regions,
   backup retention window, transfer safeguards).
5. **Store-domain validation on delete-account** — confirm the user-scoping in
   `src/app/api/auth/delete-account/route.ts` matches `purgeStoreData`
   (`relationMode = "prisma"` requires explicit deletes — covered).