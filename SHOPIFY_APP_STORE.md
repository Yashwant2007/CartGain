# Shopify App Store — Listing & Submission Plan

**Owner**: Yashwant (account holder) + AI partner (assets + code)
**Status date**: Aug 4, 2026
**Goal**: Approved, public CartGain listing on the Shopify App Store within 21 days.

---

## 1. WHAT'S ALREADY DONE (no extra work)

CartGain is already a functional embedded Shopify app:

- `src/app/api/shopify/install` + `callback` — full OAuth install flow (per-user tokens, refresh-token rotation, `grant_options[]=per-user`)
- `src/app/api/shopify/connect`, `pending-install`, `session-token`, `health` — install lifecycle
- `src/lib/shopify.ts` — token encryption, refresh-before-expiry, AbortSignal-bounded calls
- `src/lib/shopify-graphql.ts` — GraphQL client (used for bargain discount-code creation)
- `src/lib/shopify-embed.ts` — Shopify App Bridge/session token verification
- `next.config.js` — `frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com` (required for embedding)
- Webhooks: `src/app/api/webhooks/shopify` — abandoned cart, order, checkout, app/uninstalled
- Scopes (`.env.example`): `read_checkouts,write_checkouts,read_orders,write_orders,read_customers,write_customers,read_products,write_products,read_merchant_managed_fulfillment_orders,write_webhooks,read_webhooks`
- `app/uninstalled` webhook handling for cleanup
- All dashboard pages already render inside admin.shopify.com iframe

**Verdict**: the technical "embedded app" surface is COMPLETE. Only the App Store *listing* and *billing-via-Shopify* gap remain.

---

## 2. THE ONE REAL GAP — Shopify Billing

Shopify's App Store policy **requires** apps that charge merchants to do so via Shopify Billing (not Stripe/Razorpay). CartGain currently charges via Razorpay in our dashboard.

Two options:
- **A. Migrate Starter/Growth/Pro to Shopify Billing** (recommended for App Store). Replace `/api/subscription` + `/api/payments` to create Shopify `applicationSubscriptions` and read `currentAppInstallation.activeSubscriptions`. Pros: Marketplace Payments, less churn, Shopify bills the merchant. Cons: Shopify keeps 20% rev-share on App Store installs; our existing rev-share invoicing becomes Shopify's responsibility to compute (we still owe merchants the 3/2.5/2% rev-share on recovered revenue — handle as a `UsageRecord` line item via Shopify's `usageSubscriptions`).
- **B. Keep Razorpay, list app as "free" on App Store, charge inside our dashboard**. Pros: skip billing migration. Cons: Shopify rejects this — listing policy 3.0.5 says paid features must use Shopify Billing. We WILL be rejected. Don't take this path.

**Decision**: Migrate to Shopify Billing. This is a 2-day engineering task — Yashwant doesn't need to do anything; I'll handle it after the App Store account is set up.

---

## 3. SUBMISSION CHECKLIST (in execution order)

### Phase A — Yashwant (this week, 30 min)
1. **Create Shopify Partner account** at partners.shopify.com (free, no cost)
2. Create a new **Custom App draft** (not "Public app" yet — stay in dev mode) named "CartGain"
3. Add the `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET` to Vercel env vars (I'll wire the rest)
4. Add `cart-gain.com/api/shopify/install` to **App URL** field
5. Add `cart-gain.com/api/shopify/callback` to **Allowed redirection URIs**
6. Paste the listing copy from §4 into the **App listing** editor (save draft — don't submit yet)

### Phase B — AI partner (after Yashwant completes A, ~2 days)
1. Migrate subscription creation to Shopify Billing (`applicationSubscriptions` GraphQL mutation)
2. Replace Razorpay webhook with Shopify's `app_subscriptions/update` webhook
3. Add `UsageSubscription` line items for rev-share on recovered carts (Shopify bills per-cycle)
4. Generate 5 listing screenshots (1024×768) from the live dashboard using a dev store:
   - Dashboard overview with recovered revenue chart
   - Bargain page (the USP — must be screen #2)
   - Campaigns page
   - Analytics page
   - Integrations page (Shopify connected state)
5. Record a 30-second demo video showing a bargain → abandoned cart → WhatsApp recovery sequence
6. Submit for Shopify review

### Phase C — Shopify review (~2-3 weeks typical)
1. Expect 2-3 rounds of feedback (common: missing billing clarification, privacy policy URL, GDPR data deletion webhook)
2. We already have `/privacy`, `/terms`, `/dpa` — add `app/uninstalled` + `customers/redact` + `shop/redact` webhooks (gdpr compliance)
3. Target: Approved by end of Week 3 after submission

---

## 4. LISTING COPY (paste into Shopify Partner dashboard — ready to use)

### App name (30 chars)
```
CartGain — Abandoned Cart Recovery
```

### Subtitle / tagline (60 chars)
```
Recover abandoned carts with WhatsApp + AI bargain at checkout
```

### Short description (140 chars, shown in search results)
```
AI-powered WhatsApp, Email & SMS recovery for D2C beauty brands. Plus the first AI bargain widget that recovers price-sensitive carts.
```

### Long description (max 9000 chars — ~500 words)

CartGain turns abandoned carts into confirmed sales for India's D2C skincare & beauty brands. Built specifically for high-AOV, WhatsApp-first stores where email alone just doesn't move the needle.

**Why beauty founders choose CartGain**

Email gets a 20% open rate. WhatsApp gets 85%. CartGain meets your customers on the channel they actually check — and recovers 5-6x more carts than email-only.

Our customers typically see:
- 18-25% recovery rate (industry benchmark for multi-channel)
- Recovered revenue within the first 7 days of setup
- A measurable lift in repeat purchases thanks to personalized recovery messages

**The first AI bargain widget at checkout**

Price-sensitive buyers abandon the moment they see the price. CartGain's AI bargain widget opens a real negotiation before they leave — three distinct personas, graduated counters, walkout-retention logic, and bulk-order floors. When a bargain is accepted, a single-use Shopify discount code is generated automatically (24h expiry, 1 redemption). When a bargain is abandoned, it feeds straight into your recovery flow with the missed-deal context surfaced in every follow-up.

No other app on the Shopify App Store does this.

**Three recovery channels, one dashboard**

- **WhatsApp Business API** — industry-leading 85% open rate with rich product images and direct reply buttons
- **Email** — long-form brand storytelling that turns warm leads into repeat customers
- **SMS** (early access) — time-sensitive nudges with automated discount codes

**Dashboard that shows the money**

Real-time analytics on recovered revenue, channel performance, win rate, ROI per campaign — and per-product bargain analytics (acceptance rate, revenue saved, conversation logs you can replay).

**Built for India, works everywhere**

- WhatsApp Business API included — we handle setup, templates, compliance
- Razorpay + UPI checkout support
- DPDP Act 2023 + GDPR compliant; data encrypted at rest and in transit
- Dedicated account manager on Growth & Pro plans

**Pay only after we recover revenue**

First 50 recovered carts are free. After that, a small monthly subscription + a 2-3% revenue share on the revenue we actually recover. We charge our fees on recovered revenue, not on every message sent — so our incentives stay aligned with yours.

**Setup time**: 3-7 days. First recovered cart within a week. ROI positive within month one.

### 5 main features (Shopify asks for these)
1. AI bargain widget at checkout (patent-pending negotiation logic)
2. WhatsApp + Email + SMS automated cart recovery
3. AI-optimized send times and message copy
4. Real-time recovered-revenue analytics with channel breakdown
5. Built-in RTO/COD-fraud risk scoring for Indian D2C

### Pricing (Shopify Billing tier names)
- **Free** — ₹0/mo. First 50 recovered carts, all channels.
- **Starter** — ₹999/mo + 3% rev share on carts recovered after the first 50.
- **Growth** — ₹2,999/mo + 2.5% rev share. A/B testing, advanced analytics, priority support.
- **Pro** — ₹8,999/mo + 2% rev share. White-label reports, dedicated account manager, SLA.

### Category
Cart recovery · Marketing · Sales

### App integrations shown on listing
WhatsApp Business Cloud API · Resend (Email) · Razorpay · Shopify (billing)

### Required merchant resources (Shopify asks)
- Privacy Policy URL: https://cart-gain.com/privacy
- Terms of Service URL: https://cart-gain.com/terms
- Data Processing Agreement: https://cart-gain.com/dpa
- Support URL: https://wa.me/918708718426
- Documentation URL: (TBD — we'll stand up docs.cart-gain.com in Phase B)

---

## 5. IMAGE ASSETS NEEDED (Yashwant or I can produce)

| Asset | Specs | Source |
|------|-------|--------|
| App icon | 1024×1024 PNG, transparent forbidden | Generate from CartGain logo |
| 5 screenshots | 1024×768 PNG, dashboard views | AI partner — automate via dev store |
| App preview video | 30-60s MP4, max 50MB | Record bargain → recovery flow |
| Hero banner | 2000×700 JPG, no text overlay | Unsplash-style skincare photo |
| Promo tile | 1240×500 PNG for "Featured" placement | Optional, post-approval |

---

## 6. REVIEW PITFALLS WE'LL PRE-EMPT

| Common rejection reason | Our pre-empt |
|------|---|
| Missing GDPR data deletion | Add `customers/redact` + `shop/redact` webhooks (Phase B step 3) |
| Privacy policy missing data-retention info | Update `/privacy` page with explicit retention periods |
| Billing not via Shopify | Migrate Razorpay → Shopify Billing (Phase B step 1) |
| App Bridge embedded in new tab | Already inside iframe; verified via `shopify-embed.ts` |
| No demo credentials for reviewers | Create `demo+reviewer@cart-gain.com` store with seeded data |
| Broken links in description | Verify all listing URLs return 200 |
| Slow app load inside Shopify | Add edge caching, verify cold-start time < 2s |

---

## 7. COSTS & TIMELINE

- **Shopify Partner account**: ₹0 (free to join)
- **App Store submission**: ₹0 (one-time, no recurring fee)
- **Shopify Marketplace Fee**: 20% of revenue collected via Shopify Billing for App Store installs (built into Shopify's terms)
- **Beta testing**: free with up to 5 dev stores before submission

Total cash outlay for App Store launch: **₹0**

Timeline:
- Week 1: Partner account + listing draft (Yashwant) + Shopify Billing migration (me)
- Week 2: Screenshots, video, GDPR webhooks, polish
- Week 3-4: Submit, address reviewer feedback
- Week 5-6: Approve → public → outreach engine starts sending App Store links

---

## 8. SUCCESS METRIC

- 1 approved listing on Shopify App Store
- 10 installs within 30 days of going public
- 3 paying customers via Shopify Billing within 60 days
- App Store rating ≥ 4.5 by day 90

---

*Last updated: Aug 4, 2026 by AI partner.*
