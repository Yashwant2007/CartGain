# REFERENCES — SUBPROCESSOR DPA/SCC/TIA STATUS TRACKER

**Purpose:** Track execution status of Data Processing Agreements, Standard Contractual Clauses, and Transfer Impact Assessments for all subprocessors.

**Review Cadence:** Monthly (Legal) + Quarterly (Security)

---

## Current Status (as of 2026.08.15)

| Subprocessor | Category | DPA Status | DPA Version | SCC Executed | SCC Version | TIA Completed | TIA Date | Next Review | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase** | Database/Auth/Storage | ✅ Executed | 2025.01 | N/A (India) | — | N/A | — | 2027.01 | AWS Mumbai; ISO27001, SOC2 |
| **Vercel** | Hosting/CDN/Edge | ✅ Executed | 2025.03 | ✅ Executed | 2025.03 (EU SCC) | ✅ Done | 2025.03 | 2027.03 | Global edge; regional deployment controls |
| **MSG91** | SMS Gateway | ⚠️ Negotiating | — | N/A (India) | — | N/A | — | — | Indian entity; DLT registered |
| **Resend** | Email Gateway | ⚠️ Negotiating | — | ✅ Executed | 2026.07 (EU SCC) | ✅ Done | 2026.07 | — | US/EU regions; zero-retention logs |
| **Meta (WhatsApp)** | WhatsApp Business API | ✅ Meta DPA | 2025.06 | ✅ Meta SCC | Meta standard | ✅ Meta TIA | 2025.06 | 2027.06 | Non-negotiable; phone hashing |
| **Razorpay** | Payment Gateway | ✅ Executed | 2025.02 | N/A (India) | — | N/A | — | 2027.02 | RBI licensed; PCI-DSS |
| **OpenAI** | AI API (GPT-4o-mini) | ⚠️ API Terms + DPA Requested | — | ✅ Executed | 2026.07 (EU SCC) | ✅ Done | 2026.07 | — | Zero-retention API; no training |
| **Upstash** | Redis/Queue | ✅ Executed | 2025.04 | N/A (India) | — | N/A | — | 2027.04 | AWS Mumbai; SOC2 Type II |
| **[Error Monitoring]** | Error Tracking | ⚠️ Pending Selection | — | TBD | — | TBD | — | — | Evaluate Sentry vs Datadog |

---

## Action Required

| Subprocessor | Action | Owner | Deadline |
|---|---|---|---|
| MSG91 | Execute DPA; confirm DLT compliance flow | Legal | Week 1 |
| Resend | Finalize DPA; verify EU region locking | Legal | Week 1 |
| OpenAI | Execute DPA (beyond API terms); confirm zero-retention contractual | Legal | Week 1 |
| Error Monitoring | Select vendor; execute DPA + SCC + TIA | Engineering + Legal | Week 2 |

---

## Transfer Impact Assessment (TIA) Summary

| Transfer | Mechanism | Supplementary Measures | Residual Risk |
|---|---|---|---|
| **India → US (OpenAI)** | SCC 2021 + UK Addendum | Encryption (TLS 1.3); Zero-retention API; No onward transfer; Access controls | Low |
| **India → US/EU (Resend)** | SCC 2021 + UK Addendum | Encryption; Regional deployment (EU option); No onward transfer | Low |
| **India → Global (Meta)** | Meta DPA + SCC | Phone hashing; Meta infrastructure certifications; No onward transfer | Low |
| **India → Global (Vercel)** | SCC 2021 (EU data) | Regional deployment controls; SOC2; No onward transfer | Low |

---

## Monitoring & Triggers

| Trigger | Action | Owner |
|---|---|---|
| New subprocessor needed | 14-day notice to merchants; DPA + SCC + TIA before onboarding | Legal |
| Subprocessor changes location | Re-run TIA; update SCC if jurisdiction changes | Legal |
| Subprocessor breach | Activate DPA breach clause; notify merchants; assess impact | Security |
| Regulatory change (DPDP §16) | Assess transfer restrictions; migrate if needed | Legal |
| Annual review | Update tracker; re-verify DPA/SCC/TIA status | Legal |

---

## Documentation Repository

| Document | Location |
|---|---|
| Executed DPAs | `/legal/contracts/subprocessors/` |
| SCCs (signed) | `/legal/contracts/sccs/` |
| TIAs | `/legal/compliance/tia/` |
| Subprocessor security questionnaires | `/legal/vendor-management/` |
| Annual review records | `/legal/compliance/reviews/` |

---

## Contact

**Legal:** legal@cart-gain.com  
**Privacy:** privacy@cart-gain.com  
**Security:** security@cart-gain.com