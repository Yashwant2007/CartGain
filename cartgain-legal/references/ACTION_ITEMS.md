# REFERENCES — CONSOLIDATED ACTION ITEMS

All `[ACTION REQUIRED — CONFIRM WITH CARTGAIN TEAM]` items from the legal document suite, consolidated for tracking.

---

## Legal Entity & Registration

| # | Item | Document Reference | Status | Owner | Due |
|---|---|---|---|---|---|
| 1 | Legal entity name (exact) | Privacy Policy §16, ToS §21, DPA Parties | ❌ Unknown | Founders | Immediate |
| 2 | CIN (Corporate Identity Number) | ToS §1, DPA Parties | ❌ Unknown | Founders | Immediate |
| 3 | Registered office address (exact) | Privacy Policy §16, ToS §21 | ❌ Unknown | Founders | Immediate |
| 4 | GSTIN | ToS §6, Privacy Policy §2 | ❌ Unknown | Finance | Immediate |
| 5 | PAN | ToS §6 | ❌ Unknown | Finance | Immediate |

---

## Key Personnel

| # | Item | Document Reference | Status | Owner | Due |
|---|---|---|---|---|---|
| 6 | Grievance Officer name & designation | Privacy Policy §16, DPA (implied) | ❌ Unknown | Founders | Immediate |
| 7 | Data Protection Officer (if Significant DF) | DPDP §10 | ❌ TBD | Legal | Upon threshold |
| 8 | Authorized signatory for contracts | DPA, Subprocessor DPAs | ❌ Unknown | Founders | Immediate |

---

## Subprocessor DPA Execution

| # | Subprocessor | DPA Status | SCC Needed? | TIA Needed? | Target Date | Owner |
|---|---|---|---|---|---|---|
| 9 | MSG91 | ⚠️ Pending | No (India) | No | Week 1 | Legal |
| 10 | Resend | ⚠️ Pending | Yes (US/EU) | Yes | Week 1 | Legal |
| 11 | OpenAI | ⚠️ API Terms only | Yes (US) | Yes | Week 1 | Legal |
| 12 | Error Monitoring (TBD) | ⚠️ Pending Selection | Likely Yes | Likely Yes | Week 2 | Engineering |
| 13 | Vercel (EU data) | ✅ Executed | Yes | ✅ Done | — | — |
| 14 | Meta (WhatsApp) | ✅ Meta DPA | Meta SCC | Meta TIA | — | — |
| 15 | Supabase | ✅ Executed | No (India) | No | — | — |
| 16 | Razorpay | ✅ Executed | No (India) | No | — | — |
| 17 | Upstash | ✅ Executed | No (India) | No | — | — |

---

## Security & Compliance Operations

| # | Item | Document Reference | Status | Owner | Due |
|---|---|---|---|---|---|
| 18 | Penetration test vendor engaged | Privacy Policy §10, DPA Schedule 1 | ❌ Unknown | Security | Week 2 |
| 19 | Penetration test scheduled | Privacy Policy §10 | ❌ Unknown | Security | Month 1 |
| 20 | Bug bounty program decision | DPA Schedule 1 | ❌ Unknown | Security | Month 1 |
| 21 | PagerDuty/alerting for breaches | Privacy Policy §11, DPA §8 | ❌ Unknown | Engineering | Week 1 |
| 22 | SOC2 Type II readiness assessment | DPA §9, Subprocessor Disclosure | ❌ Unknown | Security | Month 2 |
| 23 | Cyber insurance policy | Lawyer Review §14 | ❌ Unknown | Founders | Month 2 |
| 24 | Current security certifications (ISO, SOC2) | Privacy Policy §10 | ❌ Unknown | Security | Immediate |

---

## Technical Implementation Confirmations

| # | Item | Document Reference | Status | Owner | Due |
|---|---|---|---|---|---|
| 25 | Merchant onboarding flow (live URL) | ToS §2, Privacy Policy §4 | ❌ Unknown | Engineering | Immediate |
| 26 | Consent capture mechanism (OptIn UI) | Privacy Policy §4, ToS §4.1 | ❌ Unknown | Engineering | Week 1 |
| 27 | Error monitoring provider selected | Privacy Policy §2, Subprocessor Disclosure | ❌ Unknown | Engineering | Week 1 |
| 28 | AI Bargain auto-accept default (false) | ToS §10, Privacy Policy §14 | ❌ Unknown | AI Team | Week 1 |
| 29 | Attribution window default (7 days) | ToS §7, DPA §1 | ❌ Unknown | Engineering | Week 1 |

---

## Document Versions & Dates

| # | Document | Current Version | Effective Date | Next Review | Lawyer Sign-off |
|---|---|---|---|---|---|
| 30 | Privacy Policy | 2026.08.15 | 2026-08-16 | 30 days | Required |
| 31 | Terms of Service | 2026.08.15 | 2026-08-16 | 30 days | Required |
| 32 | Data Processing Agreement | 2026.08.15 | Upon acceptance | 30 days | **Critical** |
| 33 | Cookie Policy | 2026.08.15 | 2026-08-16 | 30 days | Required |
| 34 | Acceptable Use Policy | 2026.08.15 | 2026-08-16 | 30 days | Required |
| 35 | Refund & Cancellation Policy | 2026.08.15 | 2026-08-16 | 30 days | Required |
| 36 | Subprocessor Disclosure | 2026.08.15 | 2026-08-16 | 30 days | Required |

---

## Tracking Instructions

1. **Update this file** as each item is confirmed
2. **Change status** from ❌ Unknown → 🟡 In Progress → ✅ Confirmed
3. **Add notes** for any deviations from assumptions
4. **Escalate blockers** to Founders immediately
5. **Review weekly** in compliance standup

---

## Priority Legend

| Symbol | Meaning |
|---|---|
| 🔴 | **Blocker** — Cannot launch without |
| 🟡 | **In Progress** — Active work |
| 🟢 | **Done** — Confirmed complete |
| ⚪ | **Not Started** — Future phase |