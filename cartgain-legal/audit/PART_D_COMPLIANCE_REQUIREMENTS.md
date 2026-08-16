# PART D — COMPLIANCE REQUIREMENTS

---

## India — Primary Jurisdiction

| Law / Regulation | Status (Aug 2026) | Applicability to CartGain | Key Obligations |
|---|---|---|---|
| **Digital Personal Data Protection Act, 2023 (DPDP Act)** | **Enacted Aug 2023. Rules notified Jan 2025. Commencement: staggered — §6–10, 12–15, 17–19, 21–23, 25–27, 29–30, 32–34, 36–38, 40–42 effective; §8(6) breach notification, §9 child data, §16 transfers — effective.** | **Directly applicable** — CartGain processes digital personal data in India; offers services to Indian merchants. | §6: Lawful grounds (consent/legitimate interest); §7: Consent requirements; §8: Data Fiduciary obligations (security, breach notice, DPA, DPO/grievance); §9: Child data (parental consent); §10: Significant Data Fiduciary (threshold TBD); §16: Cross-border transfers (Central Govt. may restrict); §17–19: Rights (access, correction, erasure, grievance); §30: Penalties up to ₹250 Cr. |
| **DPDP Rules, 2025** | **Notified Jan 2025** | Operationalizes DPDP Act | Consent notice format, grievance mechanism, data breach notification template, DPO requirements, significant DF criteria, cross-border transfer mechanism. |
| **IT Act, 2000 / IT Rules, 2011 (SPDI Rules)** | **In force** | Applies to "body corporate" handling sensitive personal data (passwords, financial, health, biometric) | Reasonable security practices (ISO 27001), privacy policy publication, grievance officer, consent for SPDI. CartGain handles passwords (bcrypt), payment data (Razorpay) → SPDI Rules apply. |
| **Consumer Protection Act, 2019 / E-Commerce Rules, 2020** | **In force** | B2B SaaS → limited direct applicability, but merchant is "consumer" if individual proprietor; end-customer protections flow through merchant | Unfair trade practices, misleading ads, grievance redressal, liability for deficiency. |
| **Telecom Commercial Communications Customer Preference Regulations (TCCCPR), 2018 (TRAI/DLT)** | **In force** | SMS sent via MSG91 → DLT registration required for headers/templates. Merchant = Principal Entity; CartGain = Telemarketer? | DLT registration, header/template registration, scrubbing against NCPR, consent artifacts, TTL. |
| **WhatsApp Business Policy / Meta Commerce Policy** | **Platform terms** | Mandatory for WhatsApp Cloud API access | Opt-in (explicit), template approval, 24-hr customer care window, opt-out honor, quality rating, no promotional in utility templates. |
| **TCPA (US) / CASL (Canada) / PECR (UK)** | **Foreign laws** | Apply if merchants target those jurisdictions | Prior express written consent (TCPA), implied/express consent (CASL), soft opt-in (PECR). CartGain must not enable violations. |
| **GDPR / UK GDPR** | **Foreign laws** | Apply if: (a) CartGain targets EU/UK merchants; (b) Merchants target EU/UK data subjects; (c) CartGain monitors behavior in EU/UK | Art.28 DPA, Art.6 lawful basis, Art.22 automated decision-making, Ch.V transfers, DPO/Rep if §27 applies. |

---

## When Foreign Laws Apply — Decision Matrix

| Scenario | GDPR Applies? | UK GDPR Applies? | CCPA/CPRA Applies? | Action |
|---|---|---|---|---|
| Indian merchant, Indian customers only | No | No | No | DPDP only |
| Indian merchant, EU customers (beauty brand ships to EU) | **Yes** (Art.3(2)(a) — offering goods/services) | **Yes** | No | Merchant = Controller; CartGain = Processor. Need Art.28 DPA + SCCs for OpenAI/Resend/Meta. |
| EU merchant signs up | **Yes** (Art.3(1) — establishment) | **Yes** | No | CartGain = Processor. Need Art.28 DPA, EU Rep (§27) if no EU establishment. |
| CartGain markets to EU merchants (website in EUR, EU case studies) | **Yes** (targeting) | **Yes** | No | Same as above. |
| California merchant / CA residents in cart data | No (no CA establishment/targeting) | No | **Yes** (if $25M revenue / 100k consumers / 50% revenue from sale) | Unlikely for early CartGain. Monitor. |
| CartGain uses US subprocessors (OpenAI, Resend) for EU data | **Yes** — transfer mechanism required | **Yes** | N/A | SCCs + Transfer Impact Assessment (TIA) per Schrems II. |

---

## Voluntary Contractual Addressing — Recommendation

| Law | Voluntarily Address? | Why | How |
|---|---|---|---|
| GDPR Art.28 DPA | **Yes** | Merchant expectation; unlocks EU merchants; reduces joint controller risk | Include GDPR-compliant DPA as Schedule to ToS; offer EU SCCs |
| GDPR Art.22 (Automated Decision-Making) | **Yes** | AI Bargain = "solely automated" with legal effect (price) | Human review option; meaningful information about logic; right to contest |
| CCPA/CPRA | **No** (premature) | Thresholds not met; adds complexity | Revisit at $10M ARR or CA merchant base >50 |
| Brazil LGPD | **No** | No BR targeting | Monitor |
| Australia Privacy Act | **No** | No AU targeting | Monitor |

---

## DPDP Act Commencement Status (Critical for Launch)

| Section | Subject | Status (Aug 2026) | Action |
|---|---|---|---|
| §6–7 | Lawful grounds, Consent | **Effective** | Implement lawful basis tracking (P1) |
| §8(1)–(5), (7) | Fiduciary obligations, Security, Records | **Effective** | DPA clickwrap (P2), TOMs (Schedule 1) |
| §8(6) | Breach notification | **Effective** | 72-hr workflow (P7) |
| §9 | Child data (parental consent) | **Effective** | Age gate (P9) |
| §10 | Significant Data Fiduciary | **Effective** (threshold TBD) | Monitor; prepare DPIA/DPO readiness |
| §16 | Cross-border transfers | **Effective** | SCCs + TIA (P5, P6) |
| §17–19 | Data subject rights | **Effective** | DSR portal (P11) |
| §30 | Penalties | **Effective** | Up to ₹250 Cr — ensure compliance |

> **Verify:** Check MeitY notifications for exact commencement dates. Some provisions may have deferred dates.