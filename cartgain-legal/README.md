# CartGain Legal & Compliance Package
**Version:** 2026.08.15 | **Prepared:** August 16, 2026  
**Classification:** Confidential — Attorney Work Product

---

## Directory Structure

```
cartgain-legal/
├── README.md                           # This file
├── audit/
│   ├── PART_A_EXECUTIVE_AUDIT.md       # Readiness score, strengths, weaknesses, immediate actions
│   ├── PART_B_WEBSITE_AUDIT.md         # Current website claims vs required corrections
│   ├── PART_C_DATA_FLOW_ROLES.md       # Processing activities, Controller/Processor analysis
│   ├── PART_D_COMPLIANCE_REQUIREMENTS.md # India DPDP, foreign laws, decision matrix
│   └── PART_E_PRODUCT_CHANGES.md       # Technical changes required (P1-P15)
├── documents/
│   ├── H1_PRIVACY_POLICY.md            # Complete Privacy Policy
│   ├── H2_TERMS_OF_SERVICE.md          # Complete Terms of Service
│   ├── H3_DATA_PROCESSING_AGREEMENT.md # Complete DPA with Schedules 1-3
│   ├── H4_COOKIE_POLICY.md             # Cookie Policy
│   ├── H5_ACCEPTABLE_USE_POLICY.md     # AUP
│   ├── H6_REFUND_CANCELLATION_POLICY.md # Refund & Cancellation Policy
│   └── H7_SUBPROCESSOR_DISCLOSURE.md   # Subprocessor & Data-Sharing Disclosure
├── checklists/
│   ├── PART_I_LAUNCH_CHECKLIST.md      # Phase 0 (Must), Phase 1 (Should), Phase 2 (Enterprise)
│   └── PART_J_LAWYER_REVIEW.md         # Documents to review, specific questions, unresolved items
└── references/
    ├── ACTION_ITEMS.md                 # All [ACTION REQUIRED] items consolidated
    ├── SUBPROCESSOR_TRACKER.md         # DPA/SCC/TIA status tracker
    └── VERSION_HISTORY.md              # Document version control
```

---

## Quick Start

### For Founders / Product Team
1. Read `audit/PART_A_EXECUTIVE_AUDIT.md` — understand readiness score (42/100) and top 10 red flags
2. Review `checklists/PART_I_LAUNCH_CHECKLIST.md` — Phase 0 items are **blockers for first customer**
3. Assign owners for each Phase 0 technical change (P1-P10)

### For Engineering
1. Implement Phase 0 changes per `audit/PART_E_PRODUCT_CHANGES.md` (P1-P10)
2. Reference `documents/H3_DATA_PROCESSING_AGREEMENT.md` Schedule 1 for security controls
3. Use `references/SUBPROCESSOR_TRACKER.md` to track DPA execution

### For Legal Counsel
1. Review `checklists/PART_J_LAWYER_REVIEW.md` — contains specific questions for Indian TMT/privacy lawyer
2. Verify all `[ACTION REQUIRED]` items in `references/ACTION_ITEMS.md`
3. Sign off on each document in `documents/` before launch

---

## Document Status

| Document | Status | Lawyer Review | Engineering Dependencies |
|---|---|---|---|
| Privacy Policy | Draft v1.0 | Required | P1, P2, P4, P7, P8, P9, P14 |
| Terms of Service | Draft v1.0 | Required | P2, P3, P10 |
| Data Processing Agreement | Draft v1.0 | **Critical** | P2, P5, P6 |
| Cookie Policy | Draft v1.0 | Required | P8 |
| Acceptable Use Policy | Draft v1.0 | Required | — |
| Refund & Cancellation Policy | Draft v1.0 | Required | — |
| Subprocessor Disclosure | Draft v1.0 | Required | P5, P6 |

---

## Key Dates

| Milestone | Target |
|---|---|
| Phase 0 Complete (Must Fix) | Before first paid customer |
| Phase 1 Complete (Should Fix) | Before scale (100+ merchants) |
| Lawyer Sign-off | Before commercial launch |
| Penetration Test | 6 weeks from kickoff |
| SOC2 Type II Readiness | 6 months |

---

## Disclaimer

> **These documents are a legal drafting starting point and compliance framework.** They should be reviewed against CartGain's actual technical architecture, contracts, processing activities and applicable law by qualified counsel before commercial launch. They do not guarantee legal compliance.

---

**Prepared by:** Senior Technology/SaaS/Privacy Counsel (AI-assisted)  
**Next Review:** Upon Phase 0 completion or 30 days