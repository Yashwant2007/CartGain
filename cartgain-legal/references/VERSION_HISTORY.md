# REFERENCES — VERSION HISTORY

**Purpose:** Track document versions, changes, and approvals for audit trail.

---

## Document Versions

| Document | Version | Date | Author | Changes | Legal Review | Status |
|---|---|---|---|---|---|---|
| Privacy Policy | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft based on codebase audit | Pending | Draft |
| Terms of Service | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft based on codebase audit | Pending | Draft |
| Data Processing Agreement | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft with Schedules 1-3 | Pending | Draft |
| Cookie Policy | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft | Pending | Draft |
| Acceptable Use Policy | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft | Pending | Draft |
| Refund & Cancellation Policy | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft | Pending | Draft |
| Subprocessor Disclosure | 2026.08.15 | 2026-08-15 | AI Counsel | Initial draft | Pending | Draft |

---

## Version Numbering Scheme

**Format:** `YYYY.MM.DD` (e.g., 2026.08.15)

- **Major:** Material legal change (new obligations, liability shifts, jurisdiction changes)
- **Minor:** Clarifications, typo fixes, contact updates, subprocessor additions
- **Patch:** Internal formatting, cross-reference fixes

**Rule:** Any change requiring merchant re-acceptance = new version number.

---

## Change Log

| Date | Document | Version | Change Type | Description | Approved By |
|---|---|---|---|---|---|
| 2026-08-15 | All | 2026.08.15 | Initial | Complete legal suite drafted from codebase audit | — |

---

## Upcoming Changes (Planned)

| Target Date | Document | Planned Version | Trigger | Description |
|---|---|---|---|---|
| Post-lawyer-review | All | 2026.09.xx | Legal sign-off | Incorporate lawyer redlines |
| Phase 0 complete | Privacy Policy, DPA | 2026.09.xx | Technical implementation | Update for lawful basis fields, OptIn model, breach workflow |
| Subprocessor DPA execution | Subprocessor Disclosure, DPA Schedule 2 | 2026.09.xx | Contract execution | Update DPA status columns |
| SCC execution | DPA Schedule 3, Privacy Policy §7 | 2026.09.xx | Contract execution | Add SCC references |
| Penetration test complete | Privacy Policy §10, DPA Schedule 1 | 2026.10.xx | Security milestone | Add pen test date, findings summary |

---

## Merchant Re-Acceptance Tracking

| Document | Current Version | Merchants Accepted | Pending Re-Acceptance | Method |
|---|---|---|---|---|
| Terms of Service | 2026.08.15 | 0 | 0 | Clickwrap at signup |
| DPA | 2026.08.15 | 0 | 0 | Clickwrap at signup |
| Privacy Policy | 2026.08.15 | 0 | 0 | Acknowledgment |
| Cookie Policy | 2026.08.15 | 0 | 0 | Banner consent |

---

## Legal Review Log

| Review Date | Reviewer | Documents Reviewed | Outcome | Next Review |
|---|---|---|---|---|
| — | — | — | Pending initial review | Upon engagement |

---

## Regulatory Change Monitoring

| Regulation | Last Checked | Status | Impact Assessment | Action Required |
|---|---|---|---|---|
| DPDP Act | 2026-08-15 | In force (staggered) | High | Monitor MeitY notifications |
| DPDP Rules | 2026-08-15 | Notified Jan 2025 | High | Implement Rules requirements |
| IT Act/SPDI Rules | 2026-08-15 | In force | Medium | Annual security audit |
| GDPR | 2026-08-15 | In force | Medium (if EU merchants) | SCC/TIA maintenance |
| TRAI TCCCPR | 2026-08-15 | In force | High (SMS India) | DLT registration flow |
| Meta WhatsApp Policy | 2026-08-15 | Current | High | Monitor policy updates |

---

## Approval Matrix

| Document | Technical Review | Legal Review | Founder Approval | Merchant Notice |
|---|---|---|---|---|
| Privacy Policy | Required | Required | Required | 30 days for material changes |
| Terms of Service | Required | Required | Required | 30 days for material changes |
| DPA | Required | **Critical** | Required | 30 days for material changes |
| Cookie Policy | Required | Required | Required | Banner update |
| AUP | Optional | Required | Required | Dashboard notice |
| Refund Policy | Optional | Required | Required | Email notice |
| Subprocessor Disclosure | Optional | Required | Optional | 14 days for new subprocessors |

---

## Archival

- **Retention:** All versions retained indefinitely
- **Storage:** `/legal/versions/` (Git-tracked)
- **Access:** Legal team, Founders, Auditors
- **Production:** Current versions at `/legal/current/`