# CartGain — Shopify App Store Submission Kit

> Everything needed to get CartGain listed on the Shopify App Store.
> The app already uses the GraphQL Admin API only, App Bridge session tokens,
> config-declared webhooks, and Shopify Billing.

---

## 0. Prerequisites

- [ ] Shopify Partner/Dev Dashboard account.
- [ ] App URL `https://cart-gain.com/api/shopify/install`.
- [ ] Redirect URL `https://cart-gain.com/api/shopify/callback`.
- [ ] `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` set in Vercel and matching the app.
- [ ] Scopes exactly
      `read_orders,read_customers,read_products,write_discounts`.
      Do not add checkout, customer-write, order-write, product-write, or webhook
      scopes; the app does not use them.
- [ ] Run `shopify app deploy --allow-updates` so webhooks, scopes, and extensions
      match the repository.
- [ ] App icon (1024×1024 PNG) and screenshots (see §4).

## 1. Scope and API notes

`write_discounts` is required for AI bargain and recovery discount codes. The app reads
orders/customers/products and writes only discount codes. It does not request
`read_all_orders`, `read_checkouts`, `write_checkouts`, `read_webhooks`, or
`write_webhooks`.

The Admin API surface is GraphQL-only (`2026-04`). Abandoned checkouts are read with
`abandonedCheckouts`, products with `products`, customers with `customers`, discounts
with `discountCodeBasicCreate`, and billing with `appSubscription*` /
`appUsageRecordCreate`. The OAuth token exchange endpoint remains
`/admin/oauth/access_token`.

Stores installed with older scope sets should reconnect once so Shopify grants the
current scope set.

## 2. Listing copy

**App name:** CartGain — Cart Recovery + Bargain
**Category:** Sales channels → Marketing & Conversion (also select "Email marketing")
**Tagline:**
> Recover abandoned carts with WhatsApp and email — and let AI negotiate with price-sensitive shoppers at checkout.

**Description:**

> **Recover the carts you're already losing.**
>
> Most visitors leave without buying. CartGain brings them back with WhatsApp and
> email recovery, then turns price objections into sales with **AI price negotiation
> at checkout**.
>
> **WhatsApp-first recovery**
> - Automatic cart/checkout abandonment messages with product images
> - Email fallback with explicit per-channel consent and instant opt-out
> - Product-aware copy, tracked links, and single-use return offers
> - Up to five recovery messages per customer (three email, two WhatsApp)
>
> **AI Bargain — no other app does this**
> - Customers negotiate with an AI shopkeeper before they leave
> - You control the hidden floor and margin; the AI never goes below it
> - Accepted deals create a one-use Shopify discount code automatically
> - Three personalities, graduated counters, walkout retention, bulk-order logic
> - A six-layer abuse/profanity/prompt-injection firewall protects the conversation
>
> **Your dashboard**
> - Recovered revenue, win rate, channel and per-product breakdowns
> - Campaign builder with consent-aware recipients and delivery receipts
> - Refund-adjusted net revenue and storefront funnel analytics
> - RTO/COD risk scoring for Indian D2C
>
> **Privacy and compliance**
> - India DPDP-aligned and GDPR-aware handling
> - Minimum scopes, encrypted tokens, HMAC-verified webhooks, and retention limits
>
> Start free — the first 50 recovered carts are on us.

**Keywords:** cart recovery, abandoned cart, whatsapp marketing, email marketing,
cart abandonment, sales recovery, d2c, checkout conversion, ai bargaining

Do not claim SMS: the sender implements email and WhatsApp only.

## 3. Pricing

Paid plans must use Shopify Billing. Revenue share is billed as capped usage records;
it is not invoiced through Razorpay.

| Plan | Monthly | Yearly | Included | Revenue share |
|---|---:|---:|---|---|
| Free | ₹0 | ₹0 | 50 recovered carts, 30 bargain sessions, 5 deals | — |
| Growth | ₹1,499 | ₹14,990 | 750 carts, 300 sessions, 30 deals | 3.5%, capped ₹5,000/mo |
| Pro | ₹3,999 | ₹39,990 | 3,000 carts, 1,500 sessions, 150 deals | 3%, capped ₹10,000/mo |
| Enterprise | custom | custom | unlimited | contract |

USD prices (Growth $19/mo, Pro $49/mo) and USD usage caps are placeholders marked
`[REQUIRES CONFIRMATION]` in `src/lib/shopify-billing/plans.ts`. Confirm them before
charging international merchants. Unsupported shop currencies make Shopify Billing
unavailable rather than silently charging an INR amount as USD.

## 4. Screenshots and video

- **Screenshot 1:** WhatsApp recovery preview (product image + CTA).
- **Screenshot 2:** Recovered-revenue dashboard.
- **Screenshot 3:** AI Bargain mid-negotiation — feature this first.
- **Screenshot 4:** Campaign builder with email/WhatsApp sequence.
- **Screenshot 5:** Analytics with channel and product breakdown.
- **Video (30–45s):** abandoned cart → WhatsApp → AI negotiation → accepted deal with
  discount code → order placed.

Capture from a signed-in dashboard Live Demo or a development store. The public
`/demo` route requires a session, so do not use it as an anonymous reviewer link.

## 5. Submission checklist

- [ ] App icon + screenshots uploaded.
- [ ] Listing copy pasted.
- [ ] Shopify Billing plans created and subscription/cancel flow verified.
- [ ] Protected customer data access requested for name/email/phone.
- [ ] Privacy, terms, DPA, and security pages live.
- [ ] `shopify app deploy` pushed the current scopes, webhooks, and extensions.
- [ ] App installs inside the admin iframe and App Bridge session tokens work.
- [ ] Compliance webhooks return `200`; invalid HMAC returns `401`.
- [ ] Uninstall (`app/uninstalled`) deactivates/purges store data.
- [ ] Submit and respond to reviewer feedback.

## 6. Review-call tips

- App must load **inside** the Shopify admin iframe (embedded).
- Paid features must use Shopify Billing.
- No fake reviews or review incentives.
- The app must not claim features it does not ship (no SMS claim).
- Data handling statement must match `/privacy`, `/dpa`, and
  `SHOPIFY_PROTECTED_DATA_READINESS.md`.

---

*Last updated: Nov 5, 2026.*
