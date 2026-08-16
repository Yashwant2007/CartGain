# H.1 — CARTGAIN PRIVACY POLICY

> **Version:** 2026.08.15 | **Effective:** 2026-08-16 | **Last Updated:** 2026-08-15
> **Legal Entity:** [CARTGAIN TECHNOLOGIES PRIVATE LIMITED] — **[ACTION REQUIRED — CONFIRM WITH CARTGAIN TEAM]**
> **Registered Address:** [Street No. 3, Line Par, Shanker Garden, Bahadurgarh, Haryana - 124507, India] — **[ACTION REQUIRED — CONFIRM]**
> **Contact:** privacy@cart-gain.com | **Grievance Officer:** [Name/Designation] — **[ACTION REQUIRED — CONFIRM]**

---

## 1. INTRODUCTION & SCOPE

CartGain Technologies Private Limited ("**CartGain**", "**we**", "**our**", "**us**") provides a Software-as-a-Service platform ("**Platform**") that enables e-commerce merchants ("**Merchants**", "**you**") to recover abandoned shopping carts through automated, multi-channel communications (Email, SMS, WhatsApp) and AI-assisted negotiation.

This Privacy Policy explains how we process personal data in three distinct capacities:

| Capacity | Data Subjects | Role | Examples |
|---|---|---|---|
| **Controller** | Merchants, Merchant employees, Website visitors, Trial users | We determine purposes & means | Account management, billing, platform analytics, support, AI model improvement (anonymized) |
| **Processor** | Merchants' end-customers ("**Customers**") | We process on Merchant's documented instructions | Abandoned cart ingestion, recovery messaging, AI Bargain sessions, analytics reporting to Merchant |
| **Joint Controller (limited)** | Customers in AI Bargain | We jointly determine negotiation logic with Merchant | AI Bargain floor price, concession logic, persona — Merchant sets parameters; CartGain defines engine |

**This Policy applies to:** Website visitors, Merchant account holders, Merchant team members, API users, Trial users, and Customers whose data is processed through the Platform.

---

## 2. DATA WE COLLECT — DETAILED TABLE

| Data Category | Data Elements | Source | Purpose | Legal Basis (CartGain) | Retention | Shared With |
|---|---|---|---|---|---|---|
| **Merchant Account Data** | Name, email, phone, company, role, password hash, 2FA secret, avatar | Merchant signup / profile | Authentication, authorization, billing, support, contract performance | Contract (ToS) — DPDP §6(1)(b) | Account life + 3 years post-termination (tax/legal) | Payment processor (Razorpay), Email provider (Resend), Cloud hosting (Vercel/Supabase) |
| **Merchant Billing Data** | GSTIN, billing address, invoices, payment method token, subscription plan, revenue-share events | Merchant dashboard / Razorpay webhooks | Invoicing, revenue-share calculation, tax compliance, dunning | Contract + Legal obligation (tax) — DPDP §6(1)(b)+(c) | 8 years (tax law) | Razorpay, Chartered Accountant (audit) |
| **Store Configuration** | Store name, domain, platform (Shopify/WooCommerce), API credentials (encrypted), currency, timezone, webhook URLs | Merchant dashboard / OAuth | Platform integration, cart ingestion, message delivery | Contract (Processor instruction) | Store life + 90 days | Subprocessors (platform APIs) |
| **Customer Contact Data** | Name, email, phone, WhatsApp number, shipping/billing address | Cart API / Webhook / Shopify / Import | Abandoned cart recovery messaging | **Merchant's lawful basis** (Consent / Legitimate Interest) — CartGain acts as Processor | 90 days after cart abandonment (anonymized) | MSG91 (SMS), Resend (Email), Meta (WhatsApp), OpenAI (AI content) |
| **Cart & Order Data** | Cart ID, items (product, price, qty, image), total value, currency, timestamps (abandoned, recovered, converted), recovery channel, discount code | Cart API / Webhook / Shopify | Recovery attribution, revenue-share calculation, analytics, AI personalization | **Merchant's lawful basis** — CartGain as Processor | 90 days (anonymized); Revenue events: 8 years (tax) | OpenAI (AI), Analytics (internal), Merchant dashboard |
| **Communication Logs** | Channel, content, status (sent/delivered/failed/clicked), timestamps, error codes | Platform (MSG91, Resend, Meta APIs) | Delivery tracking, compliance proof, opt-out suppression, analytics | **Merchant's lawful basis** — CartGain as Processor | 90 days (anonymized); Opt-out records: indefinite | Merchant dashboard, Subprocessors (delivery proof) |
| **AI Interaction Data** | Customer messages, offers, AI replies, negotiation state, persona, floor price, product context | AI Bargain widget / API | AI negotiation, personalized discount generation, model improvement (anonymized) | **Merchant's lawful basis** (Processor); Anonymized improvement: Legitimate Interest (Controller) | Session: 90 days; Anonymized training data: indefinite (no personal data) | OpenAI (API — zero retention per policy), Internal analytics |
| **Technical & Usage Data** | IP address, user agent, device info, pages visited, feature usage, timestamps, API calls | Web server / Application / Analytics | Security, fraud prevention, performance, product improvement, capacity planning | Legitimate Interest (Controller) — DPDP §6(1)(f) | 180 days (access logs); Aggregated: indefinite | Vercel (logs), Supabase (audit), Error monitoring (Sentry — **[ACTION REQUIRED — CONFIRM]**) |
| **Cookies & Similar Tech** | Session token, CSRF token, callback URL, PKCE verifier, OAuth state, consent cookie | Browser (first-party) | Authentication, security, OAuth flow, consent recording | Contract (essential); Consent (analytics/marketing) | Session: browser session; Consent: 1 year | None (first-party only) |
| **Support & Legal Data** | Ticket content, emails, chat logs, DSR requests, legal notices, acceptance records | Support widget / Email / Legal forms | Customer support, legal compliance, DSR fulfillment, contract evidence | Contract + Legal obligation | 3 years post-resolution; Legal holds: until resolved | Legal counsel, Authorities (if required) |

---

## 3. PURPOSE LIMITATION

We process personal data **only** for the purposes listed above. We do **not** use Customer data for:

- Advertising or profiling unrelated to cart recovery
- Cross-merchant analytics with identifiable data
- Training AI models on identifiable Customer data (OpenAI API: zero-retention; any internal improvement uses anonymized, aggregated data only)
- Selling, renting, or licensing personal data to third parties

**Merchant instruction:** All Processor activities are governed by the Merchant's campaign configuration (channels, timing, templates, AI settings, floor prices) and the executed Data Processing Agreement.

---

## 4. LAWFUL BASIS & CONSENT

**For Merchants (Controller relationship):**
- Account/billing/support: **Contract performance** (ToS)
- Platform analytics: **Legitimate interest** (service improvement, security)
- Marketing communications (to Merchant): **Consent** (opt-in at signup, unsubscribe anytime)

**For Customers (Processor relationship):**
- CartGain **does not determine** the lawful basis for Customer processing. The **Merchant is responsible** for establishing and documenting a valid lawful basis under applicable law (consent, legitimate interest, contract) for each channel:
  - **WhatsApp**: Explicit opt-in required per Meta Business Policy
  - **SMS (India)**: DLT-registered template + documented consent per TRAI TCCCPR 2018
  - **SMS (US)**: TCPA prior express written consent
  - **Email**: Consent or soft opt-in (existing customer, similar products, clear unsubscribe)
- CartGain provides **tools** to record, verify, and suppress based on consent (OptIn/OptOut models, consent proof fields). CartGain **may block** messages where consent cannot be verified.

**Withdrawal:** Customers may opt out via:
- "STOP" reply (SMS/WhatsApp) — auto-recorded in `OptOut`
- Unsubscribe link (Email) — auto-recorded
- Merchant dashboard "Consent Center" — manual suppression
- DSR request via `/privacy/request` — forwarded to Merchant + CartGain

Withdrawal is **as easy as giving consent** — single action, no login required.

---

## 5. MERCHANT VS. CARTGAIN RESPONSIBILITIES

| Responsibility | Merchant (Controller) | CartGain (Processor) |
|---|---|---|
| **Lawful basis for Customer data** | ✅ Determine, document, maintain proof | ❌ Not responsible; provides tools |
| **Privacy notice to Customers** | ✅ Provide clear, accessible notice | ❌ Not responsible; provides template reference |
| **Consent collection (WhatsApp/SMS/Email)** | ✅ Collect, record, refresh | ⚠️ Provides OptIn model + verification gate |
| **Opt-out honor** | ✅ Ultimate responsibility | ✅ Auto-suppression via `OptOut` table; real-time |
| **Data accuracy** | ✅ Ensure data provided to CartGain is accurate | ⚠️ Processes as received; flags anomalies |
| **Security of Platform** | ⚠️ Secure own credentials, team access | ✅ Infrastructure, encryption, access controls, audits |
| **Subprocessor management** | ✅ Object to new subprocessors (14 days) | ✅ Execute DPAs, notify, maintain list |
| **Data Subject Requests (DSR)** | ✅ Receive, coordinate, respond | ✅ Assist (access, export, delete via API/dashboard) |
| **Breach notification** | ✅ Notify authorities (Controller duty) | ✅ Notify Merchant within 72 hrs; assist |
| **DPIA / Transfer Impact Assessment** | ✅ For own processing | ✅ For Processor activities (CartGain-led) |
| **AI Bargain configuration** | ✅ Set floor, max discount, persona, enabled products | ⚠️ Executes within bounds; logs all decisions |

---

## 6. THIRD-PARTY SUBPROCESSORS

We engage the following subprocessors to deliver the Platform. Each has a written Data Processing Agreement (or equivalent contractual terms) with data protection obligations. **DPA Status** indicates whether a formal Art.28/§8 DPA is executed.

| Subprocessor | Category | Services | Data Received | Data Location | DPA Status | Transfer Mechanism |
|---|---|---|---|---|---|---|
| **Supabase (PostgreSQL)** | Cloud Database | Primary data store, auth, storage | All Platform data (Merchant + Customer) | AWS Mumbai (ap-south-1) | ✅ Executed | N/A (India) |
| **Vercel** | Application Hosting & CDN | Frontend/API hosting, edge functions, logs | Technical logs, IP, usage metrics | Global (multi-region) | ✅ Executed | SCC (EU data) |
| **MSG91** | SMS Delivery | Transactional/promotional SMS | Customer phone, message content | India | ⚠️ **Pending** — **[ACTION REQUIRED]** | N/A (India) |
| **Resend** | Email Delivery | Transactional/promotional Email | Customer email, message content | US / EU | ⚠️ **Pending** — **[ACTION REQUIRED]** | SCC + TIA |
| **Meta (WhatsApp Cloud API)** | WhatsApp Delivery | WhatsApp Business messaging | Customer phone (hashed), message content, template params | Global | ✅ Meta DPA (non-negotiable) | Meta SCC / Adequacy |
| **Razorpay** | Payment Processing | Subscription billing, revenue-share invoicing | Merchant billing, payment tokens | India | ✅ Executed | N/A (India) |
| **OpenAI** | AI Content Generation | Recovery messages, AI Bargain, discounts, reports | Customer name, cart items, value, interaction history (per request) | US | ⚠️ **API Terms only** — **[ACTION REQUIRED: Execute DPA/SCC]** | SCC + TIA (zero-retention API) |
| **Upstash (Redis)** | Queue & Caching | Job queues, rate limits, session cache | Job payloads (cart IDs, message content), tokens | AWS Mumbai | ✅ Executed | N/A (India) |
| **[Error Monitoring — e.g., Sentry]** | Error Tracking | Exception capture, performance | Technical context (may include PII in stack traces) | US / EU | ⚠️ **Pending** — **[ACTION REQUIRED]** | SCC + TIA |

**New Subprocessors:** We will notify Merchants via email and dashboard **14 days** before onboarding. Merchants may object in writing; if objection cannot be resolved, Merchant may terminate for convenience.

---

## 7. INTERNATIONAL DATA TRANSFERS

Customer data may be processed outside India by subprocessors listed above. We ensure appropriate safeguards:

| Transfer | Mechanism | Supplementary Measures |
|---|---|---|
| **India → US (OpenAI, Resend, Error Monitoring)** | EU Standard Contractual Clauses (2021) + UK Addendum | Encryption in transit (TLS 1.3), at rest (provider-default); API zero-retention (OpenAI); Access controls (CartGain staff only); No onward transfer |
| **India → Global (Meta WhatsApp)** | Meta DPA + SCCs | Meta's certified infrastructure; Message content minimized; Phone numbers hashed |
| **India → EU/Other (Vercel edge)** | SCCs (Controller-to-Processor) | Vercel SOC2 Type II; Regional deployment controls |

**India DPDP §16:** The Central Government may restrict transfers to certain countries. We monitor notifications and will adjust subprocessors accordingly.

**Merchant as Controller:** If you (Merchant) target Customers in EU/UK/other jurisdictions, **you are responsible** for ensuring a lawful transfer mechanism for your Controller-to-Processor relationship with CartGain. Our DPA includes SCCs for this purpose.

---

## 8. DATA RETENTION & DELETION

| Data Category | Retention Period | Deletion Method | Exceptions |
|---|---|---|---|
| **Customer Contact + Cart Data** | 90 days after cart abandonment (`abandonedAt`) | Automated cron: nullify PII fields, hash `cartId`, retain aggregated metrics | Legal hold, DSR pending, recovered cart (revenue event: 8 years) |
| **AI Bargain Sessions** | 90 days after `startedAt` | Automated cron: hard delete session + messages | Legal hold |
| **Communication Logs** | 90 days after send | Automated cron: anonymize content, retain delivery status counts | Opt-out records: indefinite (suppression) |
| **Access Logs (`DataAccessLog`)** | 180 days | Automated cron: hard delete | Legal hold, security investigation |
| **Verification Tokens** | 24 hours after expiry | Immediate on use/expiry | None |
| **Opt-Out / Suppression Records** | Indefinite (while Merchant active) | On Merchant termination: retain 90 days, then delete | Legal obligation to honor suppression |
| **Merchant Account Data** | Account life + 3 years | On termination: anonymize, retain billing 8 years | Tax, legal, regulatory |
| **Billing / Revenue Events** | 8 years (Indian tax law) | Archive (cold storage, encrypted) | Legal hold |
| **Anonymized Analytics** | Indefinite | No personal data — no deletion needed | N/A |

**Backup Deletion:** Supabase/Upstash automated backups retained per provider policy (typically 7–30 days). Point-in-time recovery window: 7 days. Full backup purge aligned with primary deletion + 30 days.

---

## 9. DATA SUBJECT RIGHTS (DPDP Act §17–19)

| Right | How to Exercise | CartGain's Role | Timeline |
|---|---|---|---|
| **Access / Information** | `/privacy/request` form or email privacy@cart-gain.com | Provide Merchant with export API; assist compilation | 30 days (DPDP) |
| **Correction** | Merchant dashboard "Consent Center" or DSR form | Apply correction to live data; propagate to subprocessors where feasible | 30 days |
| **Erasure ("Right to be Forgotten")** | DSR form | Anonymize Customer data in Platform; notify subprocessors to delete | 30 days |
| **Consent Withdrawal** | STOP reply, unsubscribe link, Merchant dashboard | Immediate suppression via `OptOut`; no further messages | Immediate |
| **Grievance / Complaint** | `/grievance` page or email grievance@cart-gain.com | Acknowledge 48 hrs; resolve 30 days; escalate to DPDP Board if unresolved | 48h ack / 30d resolve |
| **Data Portability** | DSR form | Provide structured export (JSON/CSV) of Customer data held | 30 days |

**Note:** As Processor, CartGain fulfills these rights **on behalf of and at the direction of the Merchant (Controller)**. Merchants are the primary point of contact for their Customers.

---

## 10. SECURITY MEASURES

We implement **reasonable security practices** per DPDP §8(4), IT Act §43A, and SPDI Rules:

| Control | Implementation |
|---|---|
| **Encryption in Transit** | TLS 1.2+ enforced (Vercel, Supabase, all APIs). HSTS, certificate pinning for mobile. |
| **Encryption at Rest** | Supabase (AWS EBS encryption), Upstash (AES-256), Vercel (provider default). Application-layer encryption for API keys (AES-256-GCM, `ENCRYPTION_KEY`). |
| **Authentication** | bcrypt (cost 12) for passwords; TOTP 2FA (optional); Session tokens: httpOnly, Secure, SameSite=None (cross-site for Shopify iframe), 30-day rotation. |
| **Access Control** | Role-based (Owner, Admin, Analyst); Least privilege; Admin actions require re-auth; MFA enforced for admin. |
| **Audit Logging** | `DataAccessLog` for all sensitive reads/writes (cart, customer, billing, config). Immutable (pg_audit / RLS). |
| **Secrets Management** | Environment variables (Vercel/Supabase); No secrets in code; Rotation policy (90 days). |
| **Vulnerability Management** | Dependabot alerts; Monthly dependency updates; Annual penetration test (**[ACTION REQUIRED — SCHEDULE]**). |
| **Incident Response** | Documented runbook; 24/7 alerting (PagerDuty — **[ACTION REQUIRED — CONFIRM]**); 72-hr breach notification workflow. |
| **Employee Controls** | Background checks (senior); Annual privacy/security training; Access revocation on offboarding (<4 hrs). |
| **Vendor Management** | Subprocessor DPA review; Annual security questionnaire; SOC2 Type II preferred. |

**No Absolute Security:** Despite these measures, no system is 100% secure. We do not guarantee absolute security.

---

## 11. DATA BREACH NOTIFICATION

**CartGain (Processor) obligations:**
1. Detect/confirm breach → **notify Merchant within 72 hours** (DPDP §8(6); GDPR Art.33)
2. Provide: nature, categories, approximate subjects, likely consequences, measures taken, contact for info
3. Assist Merchant in notifying authorities (DPDP Board / GDPR Supervisory Authority) and affected Customers

**Merchant (Controller) obligations:**
1. Notify authorities within 72 hours (DPDP) / 72 hours (GDPR)
2. Notify affected Customers if high risk (DPDP §8(6); GDPR Art.34)
3. Coordinate with CartGain on investigation

**Internal Process:** `DataBreach` record created → Slack/PagerDuty alert → Security lead triage → Merchant notification draft → Legal review → Send → Track in `DataBreach` model.

---

## 12. CHILDREN'S DATA (DPDP §9)

**DPDP defines "child" as individual under 18 years.** Parental consent is required for processing children's data.

- The Platform is **not directed to children**.
- Merchants in verticals appealing to minors (beauty, fashion, gaming) **must**:
  - Enable `ageGateEnabled` in store config
  - Capture `dateOfBirth` at cart/checkout
  - Enable `parentalConsentFlowEnabled` for marketing channels
- CartGain **does not knowingly** collect data from children without parental consent.
- If we become aware of child data without valid parental consent → immediate deletion + Merchant notification.

---

## 13. COOKIES & SIMILAR TECHNOLOGIES

| Cookie Name | Purpose | Category | Duration | Consent Required |
|---|---|---|---|---|
| `next-auth.session-token` | Authentication session | Essential | 30 days | No |
| `next-auth.callback-url` | OAuth redirect preservation | Essential | Session | No |
| `next-auth.csrf-token` | CSRF protection | Essential | Session | No |
| `next-auth.pkce.code_verifier` | PKCE flow security | Essential | Session | No |
| `next-auth.state` | OAuth state parameter | Essential | Session | No |
| `cg_oauth_intent` | Signup vs login intent (Google OAuth) | Essential | 30 min | No |
| `shopify_install_shop` | Shopify install flow continuity | Essential | 30 min | No |
| `cookie_consent` | Records your cookie preferences | Essential | 1 year | No (stores consent) |
| `_ga`, `_gid` | Google Analytics | Analytics | 2 years / 24h | **Yes** |

**Cookie Banner:** Granular toggles (Essential always on; Analytics opt-in). Consent recorded in `CookieConsent` model + `cookie_consent` cookie. You may withdraw anytime via banner "Manage Cookies" link.

**Separate Cookie Policy:** This section serves as our Cookie Policy. A standalone page is published at `/cookies` for transparency.

---

## 14. ARTIFICIAL INTELLIGENCE (AI) PROCESSING

| Feature | AI Provider | Data Sent | Retention by Provider | Training on Your Data? | Human Oversight |
|---|---|---|---|---|---|
| **Recovery Message Generation** (Email/SMS/WhatsApp) | OpenAI (GPT-4o-mini) | Customer name, cart items, value, store name, discount code (per request) | **Zero retention** (OpenAI API policy) | **No** (API data not used for training) | Fallback templates if AI fails; Merchant can disable AI per campaign |
| **AI Bargain Negotiation** | OpenAI (GPT-4o-mini) | Customer messages, offers, product title, original price, floor price, persona, bulk qty, walkout flag, customer history summary (per session) | **Zero retention** | **No** | **Configurable:** `autoAcceptEnabled` (default: false). If false → Merchant approval required before discount code generation. All decisions logged with `metadata.modelOutput`. |
| **Discount Optimization** | OpenAI (GPT-4o-mini) | Cart value, customer history (orders, abandons, LTV), store margin | Zero retention | No | Recommendation only; Merchant applies |
| **Customer Intent Detection** | OpenAI (GPT-4o-mini) | Aggregated metrics (orders, abandons, AOV, LTV, cart value, days since last order) | Zero retention | No | Classification only; used for segmentation |
| **Revenue Coach / Weekly Report** | OpenAI (GPT-4o-mini) | Aggregated store metrics (recovery rate, revenue, channels, campaigns) | Zero retention | No | Suggestions only; Merchant implements |
| **Campaign Setup Wizard** | OpenAI (GPT-4o-mini) | Store name, domain, currency | Zero retention | No | Recommendation only |

**Cross-Merchant Learning:** We do **not** use identifiable Merchant or Customer data to train or fine-tune models across merchants. Any product improvement uses **anonymized, aggregated metrics only**.

**Limitations:** AI may hallucinate, misrepresent prices, or generate non-compliant content. **Merchant is responsible** for reviewing AI-generated messages (if `aiOptimized` enabled) and AI Bargain outcomes. CartGain provides logging, fallback templates, and kill switches — but cannot guarantee AI accuracy.

---

## 15. CHANGES TO THIS POLICY

We may update this Policy. **Material changes** (new purposes, new subprocessors, retention changes, rights changes) will be notified via:
- Email to Merchants (30 days prior)
- Prominent banner on Platform (30 days prior)
- Updated `lastUpdated` date above

Continued use after effective date constitutes acceptance. Merchants may terminate per ToS if they disagree.

---

## 16. CONTACT & GRIEVANCE

| Purpose | Contact |
|---|---|
| **Privacy / Data Protection** | privacy@cart-gain.com |
| **Grievance Officer (DPDP §8(3))** | **[ACTION REQUIRED — CONFIRM NAME/DESIGNATION]** — grievance@cart-gain.com |
| **Legal / DPA Inquiries** | legal@cart-gain.com |
| **Postal Address** | [Street No. 3, Line Par, Shanker Garden, Bahadurgarh, Haryana - 124507, India] — **[ACTION REQUIRED — CONFIRM]** |
| **Data Subject Request Portal** | https://cart-gain.com/privacy/request |
| **Grievance Portal** | https://cart-gain.com/grievance |