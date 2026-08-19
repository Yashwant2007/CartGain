# PART B — CARTGAIN WEBSITE AUDIT

> **Note:** Unable to crawl live `https://cart-gain.com/`. Analysis based on deployed legal pages in codebase (`/privacy`, `/terms`, `/dpa`, `/security-policy`) and marketing claims inferable from code.

---

## Audit Table

| Existing Statement/Feature | Legal Concern | Risk Level | Why Problematic | Exact Correction Required |
|---|---|---|---|---|
| **Privacy Policy**: "We comply with GDPR, India DPDP Act" | **C — Legally risky** | 🔴 High | Compliance is a *process*, not a state. No DPA executed, no SCCs, no consent records. Claim creates misrepresentation liability. | Replace: "We are implementing a compliance program aligned with GDPR and the DPDP Act. Specific measures include: [list]. Full compliance depends on merchant configuration and executed agreements." |
| **Privacy Policy**: "Data shared with: WhatsApp, MSG91, Resend, OpenAI... All third parties bound by DPAs" | **B — Misleading / E — Requires evidence** | 🔴 High | No evidence DPAs executed with Meta/WhatsApp (Meta's DPA is non-negotiable), MSG91, Resend. OpenAI API terms ≠ DPA. | Replace: "We engage subprocessors under contractual terms that include data protection obligations. Subprocessor agreements are reviewed annually. Current subprocessors: [table with DPA status column]." |
| **Privacy Policy**: "Cart data anonymized 90 days after abandonment" | **A — Safe if implemented** | 🟢 Low | Code confirms `processAbandonedCarts` + retention cron. | Verify cron job exists and runs. Add: "Anonymization is automated via daily cron; backup deletion within 180 days." |
| **Privacy Policy**: "AI Bargain uses automated decision-making... Human override: floor price set by merchant" | **C — Legally risky / F — Requires product change** | 🔴 High | AI *auto-accepts* offers ≥ floor and generates discount code — no human review. "Human override" = pre-set floor only. | Replace: "AI Bargain negotiates within merchant-defined floor price and max discount. Offers at or above floor may be auto-accepted per merchant configuration. Merchants can disable auto-accept and require manual approval." |
| **Privacy Policy**: "We do not sell your customer data to third parties" | **A — Safe** | 🟢 Low | Accurate — no evidence of sale. | Keep. Add: "We share data with subprocessors strictly for service delivery under contractual restrictions." |
| **Terms**: "Free trial: 50 recovered carts... Revenue share: Starter 3%, Growth 2.5%, Pro 2%" | **B — Misleading if "recovered" undefined** | 🟡 Medium | "Recovered" = `isRecovered=true` set by CartGain logic. Merchant cannot audit. | Define "Recovered Cart" in ToS: "A cart where `convertedAt` is set via Shopify order webhook matching `cartId` within attribution window." |
| **Terms**: "You must obtain explicit consent... TCPA/TRAI/GDPR compliance" | **C — Legally risky** | 🔴 High | Shifts *all* burden to merchant; CartGain sends messages without verifying consent. Platform (Meta/TRAI) holds *sender* (CartGain) liable. | Replace: "Merchant represents it has obtained required consents. CartGain provides opt-out tools and suppression lists. CartGain may block messages where consent cannot be verified." |
| **Terms**: "Our total liability... shall not exceed total fees paid in 12 months" | **C — Legally risky under Indian law** | 🟡 Medium | Indian Contract Act §73 — limitation clauses enforceable but courts scrutinize consumer/B2B asymmetry. May not cover statutory liability (DPDP penalties). | Add carve-out: "This limitation does not apply to: (a) liability for personal data breach under applicable law; (b) fraud; (c) intellectual property infringement; (d) statutory penalties." |
| **DPA**: "Controller authorizes sub-processors: [table]" | **E — Requires evidence / F — Requires product change** | 🔴 High | No evidence subprocessor DPAs executed. No 14-day objection mechanism coded. | Add subprocessor management: (1) Maintain signed DPAs; (2) Notify merchants of new subprocessors via email + dashboard; (3) 14-day objection period with fallback. |
| **DPA**: "CartGain will notify Controller within 24 hours of breach" | **C — Legally risky** | 🔴 High | No breach detection/alerting system exists. 24-hr promise unmeetable. | Replace: "CartGain will notify Controller without undue delay and within 72 hours of becoming aware of a personal data breach, subject to verification." |
| **Security Policy** (inferred): "Encryption in transit (TLS 1.3), at rest (AES-256)" | **E — Requires evidence** | 🟡 Medium | Supabase/PostgreSQL: encryption at rest depends on config. Vercel: TLS automatic. No independent audit. | Replace: "Data encrypted in transit via TLS 1.2+. Database encryption at rest per cloud provider defaults (Supabase/AWS). Application-layer encryption for API keys. Independent penetration test scheduled [date]." |
| **Pricing Page** (inferred from code): "5–6× better recovery" / "ROI claims" | **B — Misleading / D — Technically impossible to guarantee** | 🔴 High | No benchmark study cited. "Better" vs what baseline? ASA/CCPA false advertising risk. | Remove unverified multipliers. Replace: "Merchants typically see 8–22% recovery rates depending on vertical, channels, and timing. Results vary." |
| **WhatsApp Claims**: "WhatsApp compliance managed by CartGain" | **C — Legally risky / D — Impossible to guarantee** | 🔴 High | Meta policy changes frequently. CartGain cannot override Meta bans, template rejections, quality rating. | Replace: "CartGain integrates with Meta WhatsApp Cloud API. Template approval, opt-in verification, and policy compliance are shared responsibilities. CartGain provides tools; merchant remains responsible for lawful use." |
| **AI Claims**: "AI-generated messages have 35% higher conversion" | **B — Misleading / E — Requires evidence** | 🟡 Medium | `INDUSTRY_BENCHMARKS` in code cites `revenueImpactOfAI: { improvementPercent: 35 }` — no source. | Remove or cite study: "Internal A/B testing (n=X) showed Y% improvement. Results not guaranteed." |
| **No Cookie Banner / Consent UI** | **C — Legally risky** | 🔴 High | `auth.ts` sets `sameSite: 'none'` cookies (cross-site) — requires consent under DPDP/GDPR/ePrivacy. | Implement cookie banner with categories: Essential, Analytics, Marketing. Record consent in DB. |
| **No Age Verification** | **C — Legally risky** | 🟡 Medium | Beauty D2C → minors likely. DPDP §9: child = under 18, parental consent required. | Add age gate at merchant onboarding: "Confirm your brand does not target individuals under 18" + optional DOB field in cart capture. |

---

## Risk Classification Legend

| Code | Meaning |
|---|---|
| **A** | Safe as written |
| **B** | Misleading |
| **C** | Legally risky |
| **D** | Technically impossible to guarantee |
| **E** | Requires evidence/documentation |
| **F** | Requires modification of the actual product |

---

## Priority Actions

1. **Immediate (Pre-Launch)**: Fix all 🔴 High items — these create active legal exposure
2. **Short-term (30 days)**: Address 🟡 Medium items — improve defensibility
3. **Ongoing**: Monitor 🟢 Low items — maintain accuracy