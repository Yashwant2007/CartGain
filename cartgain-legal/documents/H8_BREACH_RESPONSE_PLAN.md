# H.8 — CARTGAIN DATA BREACH RESPONSE PLAN

> **Version:** 2026.10.06 | **Effective:** 2026-10-06 | **Last Updated:** 2026-10-06
> **Owner:** Security & Compliance Lead | **Review Frequency:** Quarterly or after any breach

---

## 1. PURPOSE & SCOPE

This plan defines CartGain's procedures for detecting, containing, investigating, notifying, remediating, and documenting personal data breaches. It applies when CartGain is acting as Processor or Controller.

## 2. DEFINITIONS

**Personal Data Breach**: Unauthorized access, disclosure, alteration, loss, or destruction of personal data (including accidental).

## 3. ROLES & RESPONSIBILITIES

| Role | Responsibility | Contact |
|---|---|---|
| Incident Commander (IC) | Overall coordination, decision authority | security@cart-gain.com |
| DPO/Data Protection Lead | Regulatory notification, DPA compliance | privacy@cart-gain.com |
| Engineering Lead | Containment, forensics, logs | eng@cart-gain.com |
| Legal Counsel | Risk assessment, notifications | legal@cart-gain.com |
| Comms Lead | Customer/Merchant comms | support@cart-gain.com |

## 4. BREACH RESPONSE TIMELINE

| Phase | Time | Action |
|---|---|---|
| Detection | 0 min | Alert via monitoring/logging |
| Triage | 15-30 min | Confirm scope, classify severity |
| Containment | 1 hr | Isolate affected systems, revoke access |
| Investigation | 1-4 hrs | Determine nature, affected data, scope |
| Merchant Notification (Processor) | **≤72 hrs** from confirmation | Notify affected Merchants per DPA §6 |
| Regulator Notification (Controller) | As required (≤72 hrs GDPR, per DPDP timelines) | With DPO guidance |
| Remediation | Ongoing | Fix root cause, verify |
| Post-Mortem | ≤14 days | Document lessons, CAPAs |

## 5. NOTIFICATION REQUIREMENTS (Processor)

Per DPA §6: Notify Merchant within 72 hours with: breach description, affected data categories, affected data subjects, likely consequences, measures taken/planned, contact point.

## 6. CONTAINMENT CHECKLIST
- [ ] Isolate affected endpoints/services
- [ ] Revoke compromised credentials/tokens
- [ ] Block suspicious IPs
- [ ] Preserve logs for forensics
- [ ] Document timeline

## 7. INVESTIGATION & EVIDENCE
Preserve audit trails, access logs, API logs, webhook logs. Chain of custody.

## 8. REMEDIATION & RECOVERY
Patch, rotate secrets, access review, penetration testing if needed.

## 9. POST-INCIDENT
Post-mortem within 14 days, update controls, track CAPAs.

## 10. TESTING
Test plan annually via tabletop exercise. Document results.

---

**Contact:** privacy@cart-gain.com | security@cart-gain.com
