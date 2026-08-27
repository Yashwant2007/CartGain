# CartGain — Shopify App Store Submission Kit

> Everything needed to get CartGain listed on the Shopify App Store.
> Infrastructure work (this repo) is DONE: embedded-mode headers, App Bridge session tokens,
> `shopify.app.toml`, `write_discounts` scope.

---

## 0. Prerequisites (Yashwant — 1 hour)

- [ ] Shopify Partner account: https://partners.shopify.com (free; **$99 one-time** only if you choose the Partner-only plan — the Starter plan is free and includes App Store listing)
- [ ] In Partner Dashboard → Apps → Create App → **CartGain**
  - App URL: `https://cart-gain.com/api/shopify/install`
  - Redirection URL: `https://cart-gain.com/api/shopify/callback`
  - Add scopes: `read_checkouts write_checkouts read_orders write_orders read_customers write_customers read_products write_products read_discounts write_discounts read_merchant_managed_fulfillment_orders write_webhooks read_webhooks`
- [ ] Set `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in Vercel to match this app
- [ ] Add an App Store icon (1024×1024 PNG) and screenshots (see §4)

## 1. ⚠️ IMPORTANT — scope change for existing stores

`write_discounts` (needed for AI bargain discount codes) is a NEW scope.
Stores installed before this change must reconnect once:

1. In CartGain dashboard → Integrations → disconnect the store
2. Reconnect via Shopify → they'll see the new permission prompt → approve

New installs are unaffected.

## 2. Listing copy (ready to paste)

**App name:** CartGain — WhatsApp Cart Recovery + AI Bargaining
**Category:** Sales channels → Marketing & Conversion (also select "Email marketing")
**Tagline (short description):**
> Recover abandoned carts with WhatsApp, Email & SMS — and let AI negotiate with bargain hunters at checkout.

**Description:**

> **Recover the carts you're already losing.**
>
> On average, 7 in 10 visitors leave without buying. CartGain brings them back with
> multi-channel WhatsApp + Email + SMS sequences — and then turns your biggest price
> objections into sales with **AI price negotiation at checkout**.
>
> **WhatsApp-first recovery (85% open rate vs 20% email)**
> - Automatic cart-abandonment messages with product images
> - Industry benchmark: 18–25% recovery vs 3–5% email-only
> - 3–7 day setup, no code needed
>
> **AI Bargain — no other app has this**
> - Customers negotiate the price of your products with an AI shopkeeper
> - You control the floor price and margin — the AI never goes below it
> - Accepted deals auto-generate a Shopify discount code (usage limit 1, 24h)
> - 3 personalities: Friendly Shopkeeper, Strict Negotiator, Playful Friend
> - Bulk-order discounts, walkout retention ("wait — let me match that!"), returning-customer memory
> - Built-in abuse & brand protection: a 6-layer firewall keeps profanity, jailbreaks and
>   prompt-injection from breaking character, and abusive messages don't burn negotiation attempts
>
> **Your dashboard**
> - Revenue recovered, win rates, per-product breakdown
> - Campaign builder with A/B testing and AI-optimized timing
> - Revenue share pricing — we only earn when you do
>
> **Privacy & compliance first**
> - India DPDP Act 2023 aligned, encrypted at rest & in transit
> - Opt-out honored instantly on every channel
>
> Start free — first 50 recovered carts on us, no credit card.

**Keywords (tags):** cart recovery, abandoned cart, whatsapp marketing, sms marketing, email marketing, cart abandonment, sales recovery, d2c, checkout conversion

## 3. Pricing plan setup (Partner Dashboard → Plans)

| Plan | Price | App Store billing note |
|---|---|---|
| Free Trial | ₹0 / 14 days | Standard 14-day trial for all plans |
| Starter | ₹999 / month | + 3% revenue share after first 50 recovered carts |
| Growth | ₹2,999 / month | + 2.5% revenue share (recommended badge) |
| Pro | ₹8,999 / month | + 2% revenue share |

Revenue share is billed manually in CartGain (Razorpay invoices) — do NOT wire it into
Shopify Billing. Use **one-time Shopify Billing** for the subscription amounts only.

## 4. Screenshots & video (make these — 2 hours)

- **Screenshot 1:** WhatsApp recovery message preview (product image + CTA) — shows the core value
- **Screenshot 2:** Dashboard with "Recovered revenue" chart — proof of results
- **Screenshot 3:** AI Bargain widget mid-negotiation — THE differentiator, feature this first
- **Screenshot 4:** Campaign builder — shows WhatsApp/SMS/Email sequence
- **Screenshot 5:** Analytics — channel breakdown + per-product win rates
- **Video (30–45s):** 1) cart abandoned → 2) WhatsApp message → 3) customer bargains with AI → 4) deal accepted, discount code applied → 5) order placed. Voiceover: "7 in 10 visitors leave. CartGain brings them back — and closes the deal."

Real store names/data preferred — use a demo store with your own product photos if needed.

**Fastest path to screenshots/video:** the pixel-perfect, self-contained demo lives at
`https://cart-gain.com/demo` — a pure client-side AI-bargain widget (Lumina Beauty store,
₹1,299 serum) with no merchant data or API calls required. It runs instantly in any browser,
supports all 3 personas, and is ideal for capture #3 (AI Bargain mid-negotiation) and the video.

## 5. Submission checklist

- [ ] App icon + screenshots uploaded (§4)
- [ ] Listing copy pasted (§2)
- [ ] Pricing plans created (§3)
- [ ] Privacy policy + terms + DPA URLs live (https://cart-gain.com/privacy, /terms, /dpa) + security policy (https://cart-gain.com/security-policy)
- [ ] App serves embedded correctly: install from a test store → opens inside admin → connect → dashboard loads
- [ ] `shopify app deploy` pushed app config (optional — dashboard config is authoritative)
- [ ] "Uninstall" webhook handling verified (app/uninstalled → store deactivated)
- [ ] Submit → review takes 1–7 business days → respond to any feedback fast

## 6. Review-call tips (what Shopify checks)

- App must load **inside** the Shopify admin iframe (embedded) — our CSP now allows this
- No fake reviews / incentives for reviews
- Billing must not charge before the trial ends
- Data handling statement required — our privacy policy covers DPDP + GDPR language

---

*Last updated: 2026-08-02 by AI partner.*
