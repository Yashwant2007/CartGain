# Shopify App Store — Listing & Submission Plan

**Owner**: Yashwant (account holder) + AI partner (assets + code)
**Status date**: Nov 5, 2026
**Goal**: Approved public CartGain listing on the Shopify App Store.

---

## 1. What is already implemented

CartGain is a functional embedded Shopify app:

- **Install / auth** — `src/app/api/shopify/install` + `callback` implement OAuth with
  expiring offline tokens and refresh-token rotation; `connect`, `pending-install`,
  `session-token`, and `health` cover the install lifecycle.
- **Admin API** — the app uses the **GraphQL Admin API only** (`2026-04`):
  `shopifyGraphQL()` in `src/lib/shopify.ts` backs abandoned checkouts, products,
  customer-name lookup, discount creation, billing, and image lookup. OAuth token
  exchange (`/admin/oauth/access_token`) is the only non-GraphQL Admin call.
- **Webhooks** — `src/app/api/webhooks/shopify` handles carts/checkouts, orders,
  refunds, customers, uninstall, and subscription updates. Subscriptions are declared
  in `shopify.app.toml` / `shopify.app.custom.toml` and registered by
  `shopify app deploy`; the runtime does **not** create webhooks through the API.
- **Compliance webhooks** — `customers/data_request`, `customers/redact`, and
  `shop/redact` are declared with `compliance_topics` and handled with HMAC
  verification, durable exports, and full store/customer deletion.
- **Embedding** — App Bridge from Shopify's CDN, session-token exchange, and CSP
  `frame-ancestors` for `*.myshopify.com` / `admin.shopify.com`.
- **Scopes** — `read_orders,read_customers,read_products,write_discounts` only.

**Verdict**: the technical app surface is complete. The remaining work is App Store
listing assets, protected-customer-data approval, and final review.

---

## 2. Billing

App Store policy requires paid app features to use **Shopify Billing**. CartGain now
does exactly that:

- Paid subscriptions are created with `appSubscriptionCreate` and cancelled with
  `appSubscriptionCancel` (`src/lib/shopify-billing/`).
- Revenue share is billed as capped **app usage records** with
  `appUsageRecordCreate`; it is not collected by Razorpay.
- `app_subscriptions/update` keeps local entitlement in sync.
- Razorpay remains only as a **legacy cancellation path** for merchants who
  subscribed before the migration. It is never used to start or collect an app charge.

Billing prices are currency-specific (`src/lib/shopify-billing/plans.ts`). INR values
are canonical; USD values are placeholders marked `[REQUIRES CONFIRMATION]` and must be
confirmed before charging international merchants.

**Custom distribution**: Shopify does not allow the Billing API for custom apps. A
custom-distribution install can stay on the free tier or use a manually invoiced
contract handled outside this codebase; it must not be sold as an App Store paid plan.

---

## 3. Submission checklist

### Phase A — account and app setup
1. Confirm the Partner/Dev Dashboard app record and `SHOPIFY_API_KEY` /
   `SHOPIFY_API_SECRET` in Vercel.
2. Confirm App URL `https://cart-gain.com/api/shopify/install` and redirect URL
   `https://cart-gain.com/api/shopify/callback`.
3. Run `shopify app deploy --allow-updates --message "listing build"` so the declared
   webhooks, scopes, and extensions match the code.
4. Request **Protected customer data** access for **Name, Email, Phone** in the Dev
   Dashboard. CartGain does not persist street addresses.
5. Paste the listing copy from §4 and upload the assets from §5.

### Phase B — review evidence
1. Verify one full install from a development store, including App Bridge/session-token
   auth inside the admin iframe.
2. Exercise one storefront bargain and one abandoned-cart recovery end to end.
3. Send the three compliance webhooks from the Dev Dashboard and confirm `200` plus the
   documented deletion/export behaviour.
4. Confirm billing: subscribe to Growth, verify `app_subscriptions/update`, then cancel
   and verify `appSubscriptionCancel`.
5. Capture screenshots and the demo video.

### Phase C — Shopify review
Expect requests for billing evidence, privacy/retention details, GDPR handling, and
App Bridge checks. Respond with the exact code paths in this repository and the public
policy URLs.

---

## 4. Listing copy

### App name (30 chars)
```
CartGain — Cart Recovery + Bargain
```

### Subtitle (60 chars)
```
Recover carts with WhatsApp + AI price negotiation
```

### Short description (140 chars)
```
Win back abandoned carts with WhatsApp and email, then turn price objections into sales with an AI bargain widget at checkout.
```

### Long description

**Recover the carts you are already losing.**

Most shoppers leave without buying. CartGain brings them back with WhatsApp and email
recovery, then gives price-sensitive shoppers a real way to say yes with AI price
negotiation at checkout.

**WhatsApp-first recovery**
- Automatic cart and checkout abandonment messages with product images
- Email fallback and per-channel consent, with opt-out honoured instantly
- Product-aware messages, tracked links, and single-use return offers
- Up to five recovery messages per customer (three email, two WhatsApp)

**AI Bargain — a different way to close the sale**
- Shoppers negotiate with an AI shopkeeper before they leave
- You set the hidden floor and margin; the offer never goes below it
- Three shopkeeper personalities, graduated counters, and walkout retention
- Accepted deals create a one-use Shopify discount code automatically
- Abandoned negotiations feed into recovery with the missed-deal context

**A dashboard that shows the money**
- Recovered revenue, channel performance, win rate, and per-product breakdowns
- Campaigns, consent-aware recipients, and delivery receipts
- Storefront funnel, design/personality comparisons, and refund-adjusted net revenue
- Bargain learning evidence is gated: live learning stays off until the merchant
  enables it

**Built for Indian D2C, usable anywhere**
- WhatsApp Business Cloud API support
- DPDP-aligned and GDPR-aware handling; data encrypted in transit and at rest
- GraphQL Admin API integration with the minimum scopes we need
- RTO/COD risk scoring for Indian D2C stores

**Pricing that follows the outcome**
Start free with the first 50 recovered carts. Paid plans bundle recovery and bargain
usage, and our revenue share is capped so the bill stays predictable.

### Main features
1. AI bargain widget with hidden floors and automatic Shopify discount codes
2. WhatsApp + email abandoned-cart recovery with explicit per-channel consent
3. Product-aware copy, tracked links, and single-use offers
4. Refund-aware recovery and bargain analytics
5. RTO/COD risk scoring for Indian D2C

### Pricing (Shopify Billing)
- **Free** — ₹0/mo. 50 recovered carts, 30 bargain sessions, 5 accepted deals.
- **Growth** — ₹1,499/mo (₹14,990/yr). 750 recovered carts, 300 sessions, 30 deals.
  3.5% revenue share, capped at ₹5,000/mo. USD placeholder: $19/mo.
- **Pro** — ₹3,999/mo (₹39,990/yr). 3,000 recovered carts, 1,500 sessions, 150 deals.
  3% revenue share, capped at ₹10,000/mo. USD placeholder: $49/mo.
- **Enterprise** — custom contract, unlimited usage.

Overage is billed through capped Shopify usage records (messages, extra accepted deals,
extra recovered carts). Confirm the USD placeholders before charging international shops.

### Category
Cart recovery · Marketing · Sales

### Integrations shown on the listing
WhatsApp Business Cloud API · Resend (email) · Shopify Admin GraphQL API · Shopify
Billing

### Required merchant resources
- Privacy Policy: https://cart-gain.com/privacy
- Terms of Service: https://cart-gain.com/terms
- Data Processing Agreement: https://cart-gain.com/dpa
- Security Policy: https://cart-gain.com/security-policy
- Support: https://wa.me/918708718426
- Documentation: (to be published before submission)

---

## 5. Image assets

| Asset | Specs | Source |
|---|---|---|
| App icon | 1024×1024 PNG | CartGain logo |
| 5 screenshots | 1024×768 PNG | Dashboard, bargain chat, campaigns, analytics, integrations |
| App preview video | 30–60s MP4, max 50MB | Bargain → abandoned cart → WhatsApp recovery |
| Hero banner | 2000×700 JPG | Product/brand photography |
| Promo tile | 1240×500 PNG | Optional, post-approval |

Capture the product demo from the signed-in dashboard Live Demo or a development store.
Do not use the public `/demo` URL as an anonymous reviewer link: it redirects to login
unless a session exists.

---

## 6. Review pitfalls to pre-empt

| Common rejection reason | Our pre-empt |
|---|---|
| Billing not via Shopify | Paid plans use Shopify Billing; Razorpay is legacy cancellation only |
| Missing GDPR deletion | Three compliance webhooks declared in TOML and handled |
| Privacy policy missing retention details | `/privacy` documents retention and deletion |
| App Bridge embedded in a new tab | App Bridge CDN + session tokens + iframe CSP verified |
| No reviewer demo | Provide reviewer credentials and a seeded development store |
| Broken listing links | Verify every URL returns 200 before submission |
| Claims not delivered by code | Listing copy matches implemented WhatsApp/email/bargain features; no SMS claim |

---

## 7. Costs and timeline

- Shopify Partner account: free.
- App Store submission: free.
- Shopify Marketplace Fee: 20% of revenue collected through Shopify Billing on App
  Store installs.
- Development stores: free before submission.

Timeline:
- Week 1: protected-data request, listing draft, billing verification.
- Week 2: screenshots, video, compliance webhook evidence.
- Week 3–4: submit and answer reviewer feedback.

---

## 8. Success metric

- One approved App Store listing.
- Ten installs in the first 30 days.
- Three paying customers through Shopify Billing within 60 days.
- App Store rating ≥ 4.5 by day 90.

---

*Last updated: Nov 5, 2026.*
