# PART J — LAWYER REVIEW CHECKLIST

**Take this to a qualified Indian technology/privacy lawyer (recommended: TMT/privacy practice at Tier-1 firm or specialized boutique).**

---

## DOCUMENTS TO REVIEW

| Document | Sections Requiring Legal Sign-Off |
|---|---|
| **Privacy Policy** | §2 (Data Table — verify lawful bases), §4 (Consent allocation), §6 (Subprocessor DPA status), §7 (Transfer mechanisms), §8 (Retention — tax law alignment), §10 (Security — "reasonable" standard), §11 (Breach — 72hr vs DPDP Rules), §14 (AI — Art.22 analysis), §16 (Contact — Grievance Officer designation) |
| **Terms of Service** | §4 (Merchant Responsibilities — enforceability), §7 (Revenue Share — attribution definition), §10 (AI Bargain — liability allocation), §15 (Liability Cap — Indian law validity, carve-outs), §16 (Indemnification — mutuality), §18 (Arbitration — seat, institutional rules), §20 (General — assignment, severability) |
| **DPA** | Entire document — **critical**. Focus: §3 (Processor obligations), §5 (Subprocessor flow-down), §6 (Transfers — SCC validity), §8 (Breach — 72hr), §9 (Audit — scope/cost), §11 (Liability — statutory cap exclusion), Schedule 1 (TOMs — "reasonable" per DPDP), Schedule 2 (Subprocessor list — accuracy), Schedule 3 (SCC completion) |
| **Cookie Policy** | §2 (Cookie table — completeness), §4 (Consent mechanism — DPDP §6 compliance) |
| **AUP** | §2 (Prohibited activities — breadth vs enforceability), §5 (Enforcement — due process) |
| **Refund Policy** | §1 (Subscription — Consumer Protection Act compliance), §3 (Exceptional — discretion limits) |

---

## SPECIFIC LEGAL QUESTIONS FOR COUNSEL

### 1. DPDP Act Commencement & Scope
- Confirm which sections are in force as of Aug 2026 (§8(6) breach, §9 child, §16 transfers). Verify Rules status.
- Will CartGain meet "Significant Data Fiduciary" criteria (volume, sensitivity, risk)? If yes → DPO, DPIA, audit obligations.

### 2. Joint Controller Analysis (AI Bargain)
- Analyze GDPR Art.26 / DPDP equivalent. Is CartGain a joint controller for negotiation outcomes?
- Required addendum if joint controllership determined?
- How to structure DPA to preserve Processor role with "limited discretion"?

### 3. Revenue Share = Controller Activity?
- Does CartGain's attribution logic (`isRecovered`) make it a Controller for billing purposes?
- How to structure webhook (P10) to preserve Processor role?
- Tax implications of revenue-share model (GST, TDS)?

### 4. Liability Cap Validity Under Indian Law
- Indian Contract Act §73 — are consequential loss exclusions enforceable in B2B?
- Statutory penalty carve-outs — drafting precision for DPDP §30 (₹250 Cr) and GDPR Art.83.
- Mutual indemnification — enforceability of cross-indemnity.

### 5. Arbitration & Dispute Resolution
- Seat: Bahadurgarh (Haryana) — confirm jurisdiction for enforcement.
- Institutional rules (ICAI? MCIA? Ad hoc?) — recommend specific institution.
- Interim relief provisions — compatibility with Arbitration Act.

### 6. Subprocessor DPAs & International Transfers
- MSG91, Resend, OpenAI — negotiate DPAs. OpenAI: zero-retention API ≠ DPA. Need separate DPA or rely on SCC + API terms?
- SCC validity post-DPDP Rules — any India-specific transfer mechanism required?
- TIA methodology — Schrems II compliance for India→US transfers.

### 7. TRAI/DLT Compliance (SMS India)
- Merchant = Principal Entity; CartGain = Telemarketer? Registration requirements.
- Consent artifact standards — what constitutes valid proof for DLT audit?
- Header/template registration — who registers (Merchant or CartGain)?

### 8. Meta WhatsApp DPA
- Non-negotiable. Review for conflicts with CartGain DPA (liability, audit, termination).
- Data flow: phone numbers hashed by Meta — does this reduce personal data scope?
- Quality rating impact — contractual protections if Merchant's account banned.

### 9. Child Data (DPDP §9)
- Parental consent mechanism — verifiable? Age gate sufficient?
- Beauty vertical risk — specific guidance for skincare/cosmetics merchants.
- "Verifiable parental consent" — technical implementation standards.

### 10. Cross-Border Transfers & DPDP §16
- Central Government may restrict transfers to certain countries. Monitoring process?
- SCC validity if India enacts its own transfer mechanism (adequacy-like).
- Data localization requirements — any sector-specific mandates?

### 11. Consumer Protection Act 2019 & E-Commerce Rules
- Applicability to B2B SaaS — "unfair contract terms" scrutiny.
- E-Commerce Rules 2020 — "marketplace" vs "inventory" classification for CartGain.
- Grievance officer requirements — DPDP §8(3) vs Consumer Protection Rules.

### 12. IT Act §43A / SPDI Rules
- Passwords (bcrypt), payment data (Razorpay) = SPDI. Reasonable security practices = ISO 27001?
- Audit requirement — annual independent audit mandated?
- Grievance officer for SPDI — same as DPDP or separate?

### 13. Electronic Contracts & Evidence
- IT Act §10A — clickwrap validity. Record-keeping (timestamp, IP, version).
- Evidence admissibility — signed PDF vs database record (`LegalAcceptance` model).
- Version control — how to prove which version Merchant accepted.

### 14. Insurance & Risk Transfer
- Cyber liability policy terms — subrogation, notification, DPA alignment.
- Professional indemnity — coverage for data breach, IP infringement, contract disputes.
- Directors & Officers (D&O) — for founder liability.

### 15. Intellectual Property
- AI-generated content ownership — Merchant owns output, CartGain licenses for improvement.
- Prompt engineering as trade secret — protection strategy.
- Open source dependencies — license compliance (MIT, Apache, etc.).

---

## UNRESOLVED ITEMS REQUIRING CARTGAIN TEAM CONFIRMATION

| # | Item | Status | Action |
|---|---|---|---|
| 1 | Legal entity name & CIN | ❌ Unknown | **[ACTION REQUIRED]** |
| 2 | Registered office address | ❌ Unknown | **[ACTION REQUIRED]** |
| 3 | Grievance Officer name/designation | ❌ Unknown | **[ACTION REQUIRED]** |
| 4 | Error monitoring provider (Sentry/Datadog) | ❌ Unknown | **[ACTION REQUIRED]** |
| 5 | OpenAI DPA execution status | ❌ Unknown | **[ACTION REQUIRED]** |
| 6 | MSG91 DPA execution status | ❌ Unknown | **[ACTION REQUIRED]** |
| 7 | Resend DPA execution status | ❌ Unknown | **[ACTION REQUIRED]** |
| 8 | Penetration test scheduled? | ❌ Unknown | **[ACTION REQUIRED]** |
| 9 | Bug bounty program? | ❌ Unknown | **[ACTION REQUIRED]** |
| 10 | SOC2 Type II timeline | ❌ Unknown | **[ACTION REQUIRED]** |
| 11 | PagerDuty/alerting for breaches | ❌ Unknown | **[ACTION REQUIRED]** |
| 12 | Cyber insurance policy | ❌ Unknown | **[ACTION REQUIRED]** |
| 13 | Current security certifications | ❌ Unknown | **[ACTION REQUIRED]** |
| 14 | Merchant onboarding flow (live) | ❌ Unknown | **[ACTION REQUIRED]** |
| 15 | Consent capture mechanism (live) | ❌ Unknown | **[ACTION REQUIRED]** |

---

## LAWYER DELIVERABLES EXPECTED

1. **Marked-up documents** with redlines for each of the 7 documents
2. **Legal opinion memo** addressing the 15 specific questions above
3. **Compliance gap analysis** with prioritized remediation
4. **Executed Subprocessor DPA templates** (or negotiation strategy)
5. **SCC + TIA documentation** for OpenAI, Resend, Meta, Vercel
6. **Arbitration clause finalization** (institution, rules, language)
7. **Insurance requirements specification** for broker

---

## TIMELINE

| Milestone | Target |
|---|---|
| Lawyer engagement | Immediately |
| Document review (first pass) | 2 weeks |
| Specific questions memo | 3 weeks |
| Subprocessor DPA negotiation | 4–6 weeks |
| Final sign-off on all documents | Before Phase 0 complete |
| Ongoing counsel retainer | Monthly (recommended) |

---

## FINAL DISCLAIMER

> **These documents are a legal drafting starting point and compliance framework.** They are based on:
> - CartGain's technical architecture as analyzed from the codebase (August 2026)
> - Indian law (DPDP Act 2023, DPDP Rules 2025, IT Act 2000, Contract Act 1872, Consumer Protection Act 2019) as understood to be in force
> - GDPR/UK GDPR principles for international readiness
> - Platform terms (Shopify, Meta, Razorpay, OpenAI) as publicly known
>
> **They do not guarantee legal compliance.**
>
> **Before commercial launch, you must:**
> 1. Confirm all `[ACTION REQUIRED]` items with your team
> 2. Engage a qualified Indian technology/privacy lawyer to review every document against your actual technical implementation, executed contracts, business model, and current law
> 3. Execute all Subprocessor DPAs/SCCs and complete TIAs
> 4. Implement all Phase 0 technical changes
> 5. Test the complete merchant onboarding flow with legal acceptance tracking
> 6. Document your compliance program (policies, procedures, training, records)
>
> **Compliance is a process, not a document.** These drafts give you the structure. Your engineering, operations, and legal execution make it real.