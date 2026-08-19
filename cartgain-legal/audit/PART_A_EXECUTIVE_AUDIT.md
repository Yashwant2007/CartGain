# PART A — EXECUTIVE LEGAL AUDIT

**Overall Readiness Score: 42/100**

---

## Dimension Scores

| Dimension | Score | Status |
|---|---|---|
| Data Protection (DPDP Act) | 35/100 | Critical gaps |
| Contractual Framework (ToS/DPA) | 55/100 | Partial — needs hardening |
| AI Negotiation Risk Management | 25/100 | High exposure |
| Messaging Compliance (WhatsApp/SMS/Email) | 40/100 | Platform policy gaps |
| Security & Technical Controls | 60/100 | Baseline present, evidence lacking |
| Merchant Responsibility Allocation | 50/100 | Imbalanced — over-relies on merchant |
| International Transfer Readiness | 30/100 | No SCC/adequacy framework |
| Website Legal Pages | 45/100 | Exist but legally insufficient |
| Subprocessor Management | 40/100 | Disclosed but no contractual flow-down |
| Incident/Breach Response | 35/100 | No documented plan |

---

## Current Strengths

1. **Technical architecture reflects privacy-by-design**: Data minimization in cart processing, retention schedules coded (90-day anonymization), opt-out model implemented, audit logging (`DataAccessLog` model)
2. **Role separation in code**: Merchant = Controller, CartGain = Processor for end-customer data — correctly implemented in `signIn` callback and `processAbandonedCarts`
3. **Subprocessor visibility**: DPA page lists 8 subprocessors with data locations
4. **AI governance signals**: Cooldown logic, quota handling, fallback prompts, no cross-merchant training
5. **Billing transparency**: Revenue-share model documented in code with clear plan limits
6. **Shopify OAuth verification**: HMAC validation on install route
7. **Rate limiting**: Applied to auth, opt-out, and messaging endpoints

---

## Critical Weaknesses

| # | Weakness | Legal Impact | Evidence in Codebase |
|---|----------|--------------|---------------------|
| 1 | **No lawful basis recorded for end-customer processing** | DPDP Act §6–7 violation — consent/legitimate interest not tracked per data principal | `Cart` model has no `consentStatus`, `consentSource`, `lawfulBasis` fields |
| 2 | **AI negotiation lacks human-in-the-loop for binding offers** | Consumer protection risk — AI can generate discount codes without merchant review | `bargain.ts` `negotiateStep` returns `decision: 'accept'` with `counterOffer` → code generated automatically |
| 3 | **No DPA executed with merchants** — only published on website | GDPR Art.28 / DPDP §8(1) require written contract *before* processing | DPA page exists but no clickwrap acceptance in signup flow |
| 4 | **WhatsApp/SMS consent not verified at send time** | TRAI/DLT, TCPA, Meta policy violations — messages sent without proof of opt-in | `processSingleCart` checks `OptOut` table but no `OptIn` verification |
| 5 | **International transfers to OpenAI (US), Resend (US/EU), Meta (Global) without SCCs** | DPDP §16, GDPR Ch.V — unlawful transfer | `DPAPage` lists locations but no transfer mechanism documented |
| 6 | **No data breach notification procedure coded** | DPDP §8(6) — 72-hr notification obligation unmet | No `DataBreach` model, no alerting to merchants/authorities |
| 7 | **Merchant onboarding doesn't capture lawful basis for each channel** | Cannot demonstrate compliance per data principal | Signup flow only captures shop domain |
| 8 | **Revenue-share model creates joint controller risk** | DPDP §2(g) — CartGain determines "purpose/means" of billing via recovery attribution | `RevenueShareEvent` links recovery to channel; CartGain defines "recovered" |
| 9 | **No age verification / child data protection** | DPDP §9 — "child" = under 18; beauty brands may attract minors | No age gate, no parental consent flow |
| 10 | **Cookie consent not implemented** | DPDP §6(1), IT Act §43A — consent required for non-essential cookies | `auth.ts` sets `sameSite: 'none'` cookies but no banner/consent record |

---

## Highest-Risk Areas (Immediate Exposure)

1. **AI Negotiation → Binding Contract Formation**: AI accepts offers, generates Shopify discount codes → CartGain/merchant bound without human review
2. **Messaging Without Verified Consent**: WhatsApp/SMS sent based on merchant configuration only — no proof of end-customer opt-in
3. **No Executed DPA**: Processing end-customer data without Art.28/DPDP §8 contract = unlawful processing
4. **International Transfers Without Safeguards**: OpenAI, Resend, Meta receive personal data — no SCCs, no adequacy
5. **Revenue Attribution = Purpose Definition**: CartGain decides what counts as "recovered" → joint controller argument

---

## What Must Change Immediately (Pre-Launch)

| # | Change | Type | Owner |
|---|--------|------|-------|
| 1 | Add `lawfulBasis`, `consentStatus`, `consentProof` to `Cart`/`Customer` models | Technical | Backend |
| 2 | Implement DPA clickwrap in merchant signup + versioned PDF generation | Technical + Legal | Full-stack |
| 3 | Add human approval gate for AI `accept` decisions (or configurable auto-accept threshold) | Technical | AI/Bargain team |
| 4 | Build opt-in verification before first WhatsApp/SMS send (template + record) | Technical | Messaging team |
| 5 | Execute SCCs with OpenAI, Resend, Meta; document transfer impact assessment | Legal/Ops | Founders/Legal |
| 6 | Create `DataBreach` model + 72-hr notification workflow to merchant + authority | Technical | Backend |
| 7 | Add cookie consent banner + granular cookie categories | Technical | Frontend |
| 8 | Age verification flow for beauty/skincare vertical | Technical + Legal | Product |
| 9 | Separate CartGain's own controller processing (merchant data) from processor role (end-customer data) in all docs | Legal | Legal |
| 10 | Revenue-share attribution logic → move "recovered" definition to merchant-configurable webhook | Technical | Backend |