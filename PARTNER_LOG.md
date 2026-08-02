# CartGain — Partner Operations Log

**Status date**: Aug 2, 2026
**Partners**: Yashwant (business/outreach) + AI partner (build/ops/review)
**Motto**: Profitable with minimum costs. Revenue before features.

---

## 1. WHERE WE STAND (Audit Result)

### Product — Live & Advanced
- Domain: cart-gain.com (live, Next.js 14, deployed)
- Core: Abandoned-cart recovery via WhatsApp (live) + Email (live), SMS (NOT live — "coming soon")
- Pricing live: Starter ₹999, Growth ₹2,999, Pro ₹8,999 + revenue share (3/2.5/2% after first 50 recovered carts)
- Integration: Shopify (webhooks, OAuth, discount codes via GraphQL), WooCommerce/Magento/custom = marketing claims, NOT built
- Payments: Razorpay subscriptions + revenue-share invoicing
- Extras already built: AI bargaining (checkout negotiation), RTO/COD-fraud scoring, payment-failure recovery, walkout retention, bulk-order floors, AI coach/reports, 2FA, API keys

### Bargain System — Built & Hardened (9+ dedicated commits)
- 3 AI personas, floor computation (per-product override, profit %, bulk volume floors), graduated counters, walkout detection + retention, quantity extraction, cross-session customer memory, price verification vs Shopify (±20%), prompt-injection guards, session dedup, rate limits, Shopify discount-code auto-generation (usage limit 1, 24h)
- Gaps found in audit: no unit tests for bargain logic; no bargain analytics on merchant dashboard; product title only from manual override

### Business — ZERO customers yet (this is the real problem)
- No MRR. No beta users confirmed. No Shopify App Store listing. No outreach engine running.
- Distribution is the entire gap. The product is NOT the gap.
- **Live-site bug found (Aug 2 audit): `cart-gain.com/demo` returns 404** — the landing page "See Live Demo" / "Full Technical Demo" buttons link to `/demo` but no route exists. Either build a `/demo` page or repoint the buttons to the dashboard preview / a Loom video. Cheap credibility killer — fix before any outreach.

### Cost baseline
- Domain + hosting + WhatsApp pay-per-use: ~₹0-2K/month until customers
- 1 Starter customer (₹999) covers infra + ~1,100 WhatsApp messages

---

## 2. REALISTIC OUTCOME (speaking straight)

| Horizon | Goal | What it takes |
|---|---|---|
| 30 days | 3-5 pilot stores (free) + first ₹999 customer | 150+ outreaches, 15-20 calls |
| 90 days | ₹5-10K MRR (5-10 stores) | Consistent outreach + referrals |
| 12 months | ₹40-80K MRR (15-40 stores) | Shopify App Store + agency partners |
| Ceiling model | CartBoss does $37K/mo (~₹31L) | Same playbook, India WhatsApp advantage |

Hard truths:
- 18-25% recovery rate claims = industry benchmark for good systems; expect 5-10% real for new stores month 1.
- Expect 1-2 conversations per 20 outreaches, 1 paying customer per 3-5 conversations.
- No paid ads until 20+ paying stores.

---

## 3. TASK BOARD (current sprint)

### AI Partner (me) — doing now
- [x] P1: Unit tests for bargain engine (rule-based decisions, walkout detection, quantity extraction)
- [x] P1: Merchant dashboard bargain analytics (sessions, acceptance rate, revenue saved per product)
- [x] P2: Shopify App Store wrapper + listing assets — DONE (see below)
- [x] P2: Fix existing-session `minPrice: 0` context bug
- [x] P2: Onboarding flow (5-min setup wizard + dashboard quick-start checklist)

**Sprint complete (2026-08-02). Verified: tsc clean, 171/171 tests, `next build` full pass.**
Shopify App Store deliverables:
- `shopify.app.toml` — app config (scopes incl. `write_discounts`, embedded, webhooks aligned with runtime)
- Embedded-mode fixes: CSP now allows `cdn.shopify.com`/`admin.shopify.com`; `X-Frame-Options` removed (was blocking the admin iframe)
- `POST /api/shopify/session-token` — App Bridge JWT validation for embedded sessions
- `.env.example` — `SHOPIFY_API_SCOPES` now includes `read_discounts,write_discounts`
- `docs/shopify-app-store.md` — full submission kit: listing copy, pricing plan table, screenshot list, review-call tips
- ⚠️ Existing stores must reconnect once to grant `write_discounts` (noted in doc §1)
- Dashboard: 4-step "Get started in 5 minutes" checklist shown until first campaign exists

### Yashwant (you) — doing now (today/week)
- [ ] List 20 D2C beauty/skincare brands with Shopify stores (BuiltWith / Shopify store list / Instagram #skincareindia)
- [ ] Send first 20 WhatsApp/email outreaches using LAUNCH_GUIDE template (personalize each)
- [ ] Offer 3 stores free pilot in exchange for testimonial + feedback
- [ ] Record every conversation in this file (name, store, response, objection)
- [ ] Verify WhatsApp Business API is fully approved and test one live recovery
- [ ] Confirm SMS provider (MSG91) account and sandbox status — needed for "coming soon" promise

### Weekly rhythm
- Mon: I report build progress; you report outreach numbers (sent/replied/calls/booked)
- Fri: Review numbers, adjust pitch, kill/keep tasks
- Metric of truth: conversations booked, not messages sent

---

## 4. GOLDEN RULES
1. Revenue first, features only when a paying customer asks
2. Minimum cost: don't spend a rupee on ads/agencies until 20 paying stores
3. Every feature must trace to a customer conversation
4. WhatsApp open rate is our story (85% vs email 20%) — lead every pitch with it
5. The AI bargain widget is our hook — demo it in every call, no other tool has it

---

*Log updated by AI partner on 2026-08-02. Next review: Fri.*
