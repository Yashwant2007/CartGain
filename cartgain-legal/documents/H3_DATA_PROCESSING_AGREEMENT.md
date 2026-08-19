# H.3 — CARTGAIN DATA PROCESSING AGREEMENT (DPA)

> **Version:** 2026.08.15 | **Effective:** Upon Merchant acceptance via clickwrap
> **Parties:** **Controller:** [Merchant Legal Name] ("**Merchant**") | **Processor:** [CARTGAIN TECHNOLOGIES PRIVATE LIMITED] ("**CartGain**")

---

## 1. SUBJECT MATTER, DURATION, NATURE & PURPOSE

| Element | Details |
|---|---|
| **Subject Matter** | Processing of Customer personal data for abandoned cart recovery |
| **Duration** | Term of ToS + 90 days post-termination (deletion/return) |
| **Nature of Processing** | Collection, storage, use, transmission, analysis, deletion |
| **Purpose** | Automated cart recovery messaging (Email, SMS, WhatsApp), AI Bargain negotiation, analytics/reporting to Merchant, billing attribution |
| **Controller Instructions** | Documented in: (a) Merchant campaign configuration (channels, timing, templates, AI settings, floor prices); (b) This DPA; (c) Written supplements (email/API) |

---

## 2. CATEGORIES OF PERSONAL DATA & DATA SUBJECTS

| Personal Data Categories | Data Subjects |
|---|---|
| Name, email, phone, WhatsApp number | Customers of Merchant (abandoned cart) |
| Shipping/billing address, cart items, product details, order value | Customers |
| Communication preferences, opt-in/opt-out status | Customers |
| Message delivery status, engagement (clicks, replies) | Customers |
| AI Bargain interaction (messages, offers, negotiated price) | Customers |

---

## 3. CARTGAIN'S OBLIGATIONS (PROCESSOR)

CartGain shall:
1. **Process only on documented instructions** — unless required by law (notify Merchant if so, unless prohibited).
2. **Confidentiality** — Ensure all personnel with access are bound by confidentiality (employment contracts, NDAs, training).
3. **Security** — Implement measures per Schedule 1 (Technical & Organizational Measures).
4. **No unauthorized disclosure** — Except to Subprocessors (Schedule 2) or as instructed/required by law.
5. **DSR Assistance** — Assist Merchant in fulfilling Access, Correction, Erasure, Portability, Objection, Restriction requests within 15 days of Merchant request (API, dashboard, support).
6. **Breach Notification** — Notify Merchant **within 72 hours** of confirming a personal data breach (Schedule 1 §8).
7. **Deletion/Return** — At Merchant's choice, delete or return all Customer data at end of Term (Schedule 1 §9).
8. **Records** — Maintain records of processing activities per DPDP §8(7) / GDPR Art.30.
9. **Audit Cooperation** — Allow Merchant audit (Schedule 1 §10).

---

## 4. MERCHANT'S OBLIGATIONS (CONTROLLER)

Merchant shall:
1. **Lawful Basis** — Ensure valid lawful basis for all Customer processing; maintain records.
2. **Privacy Notice** — Inform Customers of CartGain/Subprocessor processing (link to CartGain Privacy Policy acceptable).
3. **Consent** — Obtain/record consent for WhatsApp/SMS per applicable law; provide proof via Platform OptIn model.
4. **Data Accuracy** — Ensure data sent to Platform is accurate, relevant, minimal.
5. **DSR Coordination** — Receive Customer requests; direct to CartGain for technical fulfillment.
6. **Breach Cooperation** — Notify CartGain of breaches on Merchant side; coordinate joint response.
7. **Subprocessor Objection** — Object in writing within 14 days of new Subprocessor notice.

---

## 5. SUBPROCESSORS (SCHEDULE 2)

**General Authorization:** Merchant authorizes Subprocessors listed in Schedule 2.

**New Subprocessors:** CartGain will notify Merchant ≥14 days before onboarding. Objection: written notice within 14 days. If unresolved, Merchant may terminate for convenience (no penalty).

**Flow-Down:** CartGain executes written agreements with each Subprocessor imposing obligations no less protective than this DPA.

---

## 6. INTERNATIONAL TRANSFERS

Customer data may be transferred to Subprocessors outside India (Schedule 2). CartGain ensures:
- **SCC (2021) + UK Addendum** for transfers to US/non-adequate countries
- **Transfer Impact Assessment (TIA)** completed per Schrems II
- **Supplementary measures:** Encryption, access controls, zero-retention APIs, no onward transfer
- **DPDP §16 Compliance:** Monitoring Central Government restrictions

**Merchant Responsibility:** If Merchant targets Customers in EU/UK/other jurisdictions, Merchant must ensure lawful transfer mechanism for Controller→Processor relationship. This DPA incorporates SCCs for that purpose (Schedule 3).

---

## 7. DATA SUBJECT REQUESTS (DSR)

| Right | CartGain Assistance |
|---|---|
| Access | Export API (`GET /api/dsr/export?customerId=...`) — JSON/CSV |
| Correction | PATCH via dashboard/API; propagate to Subprocessors where feasible |
| Erasure | Anonymize in Platform; request Subprocessor deletion |
| Portability | Structured export (same as Access) |
| Restriction | Flag in Platform; suppress processing |
| Objection | OptOut suppression (auto); Marketing suppression |

**Timeline:** CartGain responds to Merchant DSR request within **15 days**. Merchant remains responsible for 30-day DPDP / 1-month GDPR deadline to Customer.

---

## 8. SECURITY INCIDENTS & PERSONAL DATA BREACHES

**CartGain detects/confirms breach → within 72 hours notify Merchant with:**
- Nature, categories, approximate subjects
- Likely consequences
- Measures taken/proposed
- Contact for more info

**CartGain assists Merchant** in: authority notification, Customer notification, investigation, remediation.

**Merchant notifies authorities** (Controller duty). CartGain provides all necessary information.

---

## 9. AUDIT RIGHTS

**Merchant may audit** CartGain's compliance with this DPA:
- **Notice:** ≥30 days written notice
- **Scope:** Relevant records, facilities, Subprocessor agreements (redacted commercial terms)
- **Conduct:** During business hours, minimal disruption, Merchant bears cost (unless material non-compliance found)
- **Confidentiality:** Audit reports = Confidential Information
- **Frequency:** Max 1x per 12 months (additional if material change/breach)

**Alternative:** CartGain provides **SOC2 Type II report** (when available — **[ACTION REQUIRED — SCHEDULE]**) in lieu of on-site audit for corresponding controls.

---

## 10. DATA DELETION & RETURN

| Trigger | Action | Timeline |
|---|---|---|
| **Termination (Merchant request)** | Delete or return (Merchant choice) all Customer data | 30 days |
| **Termination (CartGain)** | Delete all Customer data | 90 days (allow export) |
| **Ongoing (Retention Policy)** | Automated anonymization/deletion per Privacy Policy §8 | Daily cron |
| **Backup Purge** | Provider backup retention + 30 days | Aligned with primary |

**Certification:** CartGain provides written deletion confirmation upon request.

---

## 11. LIABILITY

- **CartGain liability** for DPA breach: Subject to ToS §15 Cap (12-month Fees), **except** statutory data protection penalties (DPDP §30 up to ₹250 Cr; GDPR Art.83 up to €20M/4% turnover) — **no contractual cap on statutory liability**.
- **Merchant liability** for Controller breaches: Uncapped for consent failures, unlawful processing, DSR failures.
- **Joint Controller Clarification:** For AI Bargain, CartGain acts as Processor with **limited discretion** (negotiation logic within Merchant-set parameters). Merchant remains Controller for outcomes. If regulator determines joint controllership, parties will execute addendum per GDPR Art.26.

---

## 12. TERMINATION

- **Automatic** on ToS termination.
- **Survival:** §§3 (Obligations), 5 (Subprocessors), 6 (Transfers), 7 (DSR), 8 (Breach), 9 (Audit), 10 (Deletion), 11 (Liability), 13 (Governing Law) survive.
- **Effect:** CartGain ceases processing; deletion/return per §10.

---

## 13. GOVERNING LAW & DISPUTES

- **Governing Law:** India.
- **Disputes:** Per ToS §18 (Arbitration, Bahadurgarh seat).
- **Conflict:** This DPA prevails over ToS for data processing matters.

---

## SCHEDULE 1 — TECHNICAL & ORGANIZATIONAL MEASURES (TOMs)

| Control Area | Measures |
|---|---|
| **Encryption** | TLS 1.2+ (transit); AES-256-GCM (API keys); Provider-default (data at rest — Supabase, Upstash, Vercel) |
| **Access Control** | RBAC (Owner/Admin/Analyst); MFA enforced for Admin; Least privilege; Quarterly access review; Offboarding <4 hrs |
| **Authentication** | bcrypt (cost 12); TOTP 2FA; Session tokens: httpOnly, Secure, SameSite=None, 30-day rotation |
| **Audit Logging** | `DataAccessLog` (immutable, pg_audit): actor, action, resource, purpose, metadata; Retention 180 days |
| **Vulnerability Management** | Dependabot; Monthly updates; Annual pen test (**[ACTION REQUIRED — SCHEDULE]**); Bug bounty (**[ACTION REQUIRED — CONSIDER]**) |
| **Incident Response** | Documented runbook; 24/7 alerting; 72-hr breach notification; Post-mortem within 14 days |
| **Backup & Recovery** | Daily encrypted backups (Supabase); 7-day PITR; 30-day backup retention; Quarterly restore test |
| **Employee Training** | Annual privacy/security training; Phishing simulations; Background checks (senior) |
| **Physical/Environmental** | Cloud provider (AWS/Vercel) — SOC2, ISO27001 certified data centers |
| **Subprocessor Management** | DPA execution; Annual security questionnaire; SOC2 preference; Schedule 2 tracking |

---

## SCHEDULE 2 — SUBPROCESSOR LIST (CURRENT AS OF 2026.08.15)

| Subprocessor | Category | Data Processed | Location | DPA Status | Transfer Mechanism | TIA Date |
|---|---|---|---|---|---|---|
| Supabase | Database/Auth/Storage | All Platform data | AWS Mumbai | ✅ Executed | N/A | N/A |
| Vercel | Hosting/CDN/Edge | Logs, metrics, edge cache | Global | ✅ Executed | SCC (EU data) | 2026.06.15 |
| MSG91 | SMS Delivery | Phone, message content | India | ⚠️ **Pending** | N/A | N/A |
| Resend | Email Delivery | Email, message content | US/EU | ⚠️ **Pending** | SCC + TIA | 2026.07.01 |
| Meta (WhatsApp) | WhatsApp Delivery | Phone (hashed), message, template | Global | ✅ Meta DPA | Meta SCC | 2026.06.01 |
| Razorpay | Payments | Billing, payment tokens | India | ✅ Executed | N/A | N/A |
| OpenAI | AI Generation | Customer name, cart, messages, history | US | ⚠️ **API Terms only** | SCC + TIA (zero-retention) | 2026.07.15 |
| Upstash | Redis/Queue | Job payloads, tokens, cache | AWS Mumbai | ✅ Executed | N/A | N/A |
| [Error Monitoring] | Error Tracking | Stack traces (may contain PII) | US/EU | ⚠️ **Pending Selection** | SCC + TIA | TBD |

---

## SCHEDULE 3 — STANDARD CONTRACTUAL CLAUSES (CONTROLLER → PROCESSOR)

**[Incorporate EU SCC 2021 Modules 1 & 2 (Controller→Processor) + UK Addendum]**

Key completed fields:
- **Exporter (Controller):** Merchant (per signup details)
- **Importer (Processor):** CartGain Technologies Private Limited
- **Categories of Data Subjects:** Customers of Merchant
- **Categories of Personal Data:** Per DPA §2
- **Sensitive Data:** None (unless Merchant sends health/biometric — prohibited)
- **Frequency:** Continuous, automated
- **Purpose:** Per DPA §1
- **Subprocessors:** Per Schedule 2 (general authorization + 14-day objection)
- **Data Subject Rights:** Per DPA §7
- **Security:** Per Schedule 1
- **Breach Notification:** 72 hours (DPA §8)
- **Deletion/Return:** Per DPA §10
- **Audit:** Per DPA §9
- **Governing Law:** India (with EU/UK mandatory law override for data protection)
- **Jurisdiction:** Arbitration per ToS §18 (Bahadurgarh seat)