# 11 — Subprocessors and Data Locations

Authoritative merchant-facing list: `/dpa` and
`cartgain-legal/documents/H3_DATA_PROCESSING_AGREEMENT.md` (Schedule 2).
This page records what the **runtime actually calls** as of 2026-11-17.

| Provider | Purpose | Data | Location / transfer |
|---|---|---|---|
| Supabase | Postgres database | All platform data | AWS `ap-south-1` (Mumbai), India |
| Vercel | Hosting/functions/CDN | Request logs, edge cache, app runtime | Global; production functions pinned to `bom1` |
| Upstash | Redis (rate limits, cache, sweep lock) | Keys, cached IDs, job timestamps | AWS Mumbai (`ap-south-1`) |
| Resend | Email delivery + delivery webhook | Email address, message HTML/text, receipt events | US/EU; SCC/TIA recorded in DPA |
| Meta Cloud API | WhatsApp delivery + inbound webhook | Phone, template/body, delivery status | Meta DPA / SCC |
| OpenAI | Primary negotiation/recovery text | Store name, first name, product names, totals, transcript (no email/phone/address/tokens) | US; API terms + zero-retention configuration |
| Groq | Fallback model | Same minimized facts; trimmed context | US; API terms |
| Shopify | Admin GraphQL, webhooks, Billing | App install, products, checkouts, orders, customer contact, discounts | Shopify DPA |
| GitHub | CI + fallback cart-sweep trigger | No shopper row data; job call only | US |
| Cloudflare | DNS/TLS (if enabled on the zone) | DNS metadata only | Global |

## Not in the live path

- **SMS / MSG91:** the runtime has no SMS sender; legacy `sms` campaign values
  are ignored. Do not claim SMS for Level 2.
- **Razorpay:** legacy cancellation path only; new charges are Shopify Billing.
- **Error monitoring:** no dedicated third-party error tracker is currently
  wired. If one is added, it must be added to `/dpa` before use.

## Transfer safeguards

- India→US transfers use the provider DPA + SCC where applicable; the DPA lists
  the transfer mechanism and TIA date per provider.
- ⚠️ Attach executed DPAs/order forms and any missing TIA. The DPA currently
  marks Resend and the AI providers as “pending/API terms only”; that status
  must be accurate in the submission.
- No customer data is sold, shared for advertising, or used for provider model
  training per the configured API terms; verify provider settings before
  claiming zero retention.
