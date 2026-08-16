# PART I — LAUNCH CHECKLIST

---

## PHASE 0 — BEFORE FIRST CUSTOMER (MUST FIX)

| # | Item | Requirement | Why It Matters | Owner | Document/Code Change | Status |
|---|---|---|---|---|---|---|
| 1 | **Lawful Basis Fields** | Add `lawfulBasis`, `consentStatus`, `consentProof` to `Cart`/`Customer` | DPDP §6–7; cannot demonstrate compliance without | Backend | Prisma schema + migration + API validation | ⬜ |
| 2 | **DPA Clickwrap + PDF** | Signup flow: scrollable DPA, checkbox, signed PDF generation, `LegalAcceptance` records | DPDP §8(1); GDPR Art.28 — no contract = unlawful processing | Full-stack | New `LegalAcceptance` model; signup page; PDF generator (React-PDF/puppeteer) | ⬜ |
| 3 | **AI Bargain Human Gate** | `autoAcceptEnabled` default false; approval workflow for `accept` decisions | Consumer protection; GDPR Art.22; contract certainty | AI/Bargain | `BargainConfig` field; `BargainApproval` model; notification; dashboard | ⬜ |
| 4 | **Opt-in Verification Gate** | `OptIn` model; check before first WhatsApp/SMS send; queue if missing | TRAI/DLT; TCPA; Meta Policy; DPDP §6 | Backend + Messaging | `OptIn` model; `processSingleCart` gate; Merchant "Consent Center" UI | ⬜ |
| 5 | **Subprocessor DPAs** | Execute DPAs with MSG91, Resend, OpenAI, Error Monitoring; SCCs + TIA for US | DPDP §8(1); GDPR Art.28(2); Schrems II | Legal/Founders | Legal review; execution; Schedule 2 update | ⬜ |
| 6 | **Cross-Border Transfer Safeguards** | SCCs + TIA for OpenAI, Resend, Meta, Vercel (EU data) | DPDP §16; GDPR Ch.V | Legal | SCC execution; TIA documentation | ⬜ |
| 7 | **Breach Detection & 72-hr Notification** | `DataBreach` model; alerting; Merchant notification workflow | DPDP §8(6); GDPR Art.33 | Backend + Security | Model; PagerDuty/Slack alerts; notification template | ⬜ |
| 8 | **Cookie Consent Banner** | Granular (Essential/Analytics); `CookieConsent` model; block non-essential | DPDP §6; ePrivacy; GDPR Art.7 | Frontend | Banner component; consent API; GTM/GA conditional load | ⬜ |
| 9 | **Age Verification / Child Data** | Merchant onboarding gate; optional DOB capture; parental consent flow | DPDP §9 (child = <18) | Product + Backend | Store config flags; cart API field; suppression logic | ⬜ |
| 10 | **Revenue Attribution Webhook** | Move `isRecovered` to Merchant webhook; CartGain bills on receipt | Joint controller risk; auditability | Backend | Webhook endpoint; idempotent billing; attribution window config | ⬜ |

---

## PHASE 1 — BEFORE SCALE (SHOULD FIX)

| # | Item | Requirement | Why It Matters | Owner | Timeline |
|---|---|---|---|---|---|
| 11 | **DSR Portal** | Public `/privacy/request` + Merchant dashboard "Data Requests" | DPDP §17–19; GDPR Art.15–22 | Full-stack | 4 weeks |
| 12 | **Audit Log Enhancement** | `lawfulBasis`, `dpaRef`, `subprocessorInvolved` fields; immutable export | DPDP §8(7); GDPR Art.30 | Backend | 2 weeks |
| 13 | **Merchant Consent Center UI** | View/manage OptIn/OptOut per customer; bulk import/export | TRAI/DLT; TCPA; Meta | Frontend + Backend | 3 weeks |
| 14 | **Automated Retention Cron** | Daily: Cart anonymization (90d), Bargain deletion (90d), Access log purge (180d) | DPDP §8(5); GDPR Art.5(1)(e) | Backend | 1 week |
| 15 | **Penetration Test** | CREST vendor; annual; publish summary on `/security` | SPDI Rules; Enterprise trust; DPDP §8(4) | Security/Founders | 6 weeks |
| 16 | **SOC2 Type II Readiness** | Gap assessment; control implementation; auditor engagement | Enterprise sales; DPA Audit clause | Security/Founders | 6 months |
| 17 | **EU/UK Representative** | If targeting EU/UK merchants (Art.27 GDPR) | GDPR Art.27 | Legal | When needed |
| 18 | **Insurance** | Cyber liability (₹10Cr+); Professional indemnity | Risk transfer; Enterprise contracts | Founders | 3 months |

---

## PHASE 2 — ENTERPRISE READINESS (RECOMMENDED)

| # | Item | Requirement | Why It Matters | Owner | Timeline |
|---|---|---|---|---|---|
| 19 | **Custom DPA Negotiation** | Redline support; liability caps; audit rights expansion | Enterprise procurement | Legal | Per deal |
| 20 | **Data Residency Options** | EU-only hosting (Vercel EU, Supabase EU) | GDPR Art.3; Customer demand | Infra | 3 months |
| 21 | **Advanced RBAC** | Custom roles; field-level permissions; SIEM integration | Enterprise security | Backend | 2 months |
| 22 | **SSO/SAML/OIDC** | Enterprise identity providers (Okta, Azure AD, Google) | Enterprise onboarding | Backend | 2 months |
| 23 | **Private Connectivity** | VPC peering, PrivateLink, dedicated egress IPs | Enterprise infra | Infra | 4 months |
| 24 | **Contractual SLA** | 99.9% uptime; <5min p99 latency; support tiers | Enterprise procurement | Legal + Ops | Per deal |

---

## SIGN-OFF REQUIREMENTS

| Phase | Required Sign-offs |
|---|---|
| **Phase 0** | CTO (technical), Legal Counsel (contracts), Founder (business) |
| **Phase 1** | CTO, Legal Counsel, Security Lead |
| **Phase 2** | CTO, Legal Counsel, Sales/Enterprise Lead |

---

## DEFINITION OF DONE (Phase 0)

- [ ] All 10 items implemented, tested, deployed to staging
- [ ] Legal Counsel reviews and approves all document versions
- [ ] End-to-end merchant onboarding flow works (signup → DPA clickwrap → dashboard)
- [ ] AI Bargain human gate tested with mock sessions
- [ ] Opt-in gate blocks messages without OptIn record
- [ ] Cookie banner shows, records consent, blocks GA until opt-in
- [ ] Breach notification workflow tested (simulated)
- [ ] Subprocessor DPA tracker populated with executed agreements
- [ ] SCCs signed for OpenAI, Resend, Meta; TIAs documented
- [ ] Age gate tested for beauty vertical merchant