# PART E — REQUIRED PRODUCT CHANGES

---

## Technical Changes for Legal/Compliance Readiness

| # | Change | Description | Legal Driver | Priority | Effort | Owner |
|---|---|---|---|---|---|---|
| **P1** | **Lawful Basis & Consent Fields** | Add to `Cart` model: `lawfulBasis` (enum: consent, legitimate_interest, contract), `consentStatus` (obtained, not_required, pending), `consentProof` (JSON: source, timestamp, method, recordId), `consentExpiresAt`. Add to `Customer` model: `marketingConsent` (email, sms, whatsapp), `consentLog` (append-only). | DPDP §6–7; GDPR Art.6–7; TCPA/TRAI | 🔴 **MUST** | 3 days | Backend |
| **P2** | **DPA Clickwrap + PDF Generation** | Signup flow: after email verify → "Review & Accept DPA" (scrollable, versioned). Generate signed PDF with merchant name, timestamp, IP, user agent. Store in `LegalAcceptance` model: `entity`, `documentVersion`, `acceptedAt`, `ip`, `userAgent`, `signatureHash`. | DPDP §8(1); GDPR Art.28 | 🔴 **MUST** | 2 days | Full-stack |
| **P3** | **AI Bargain Human Approval Gate** | Add `BargainConfig.autoAcceptEnabled` (default: false). If false + AI returns `decision: 'accept'` → create `BargainApproval` record, notify merchant (email/push), wait for approval before generating discount code. If true → current behavior. Log all AI decisions with `metadata.modelOutput`. | Consumer Protection; GDPR Art.22; Contract certainty | 🔴 **MUST** | 3 days | AI/Bargain |
| **P4** | **Opt-in Verification Before First Message** | New `OptIn` model: `storeId`, `customerIdentifier` (email/phone), `channel`, `source` (checkbox, import, api), `proof` (JSON), `obtainedAt`, `expiresAt`. `processSingleCart` → check `OptIn` exists for channel before send. If missing → queue for merchant review, do not send. | TRAI/DLT; TCPA; Meta Policy; DPDP §6 | 🔴 **MUST** | 4 days | Backend + Messaging |
| **P5** | **Subprocessor DPA Execution & Tracking** | Create `Subprocessor` model: `name`, `category`, `dpaSignedAt`, `dpaVersion`, `dataLocation`, `transferMechanism` (SCC, adequacy, derogation), `tiaCompletedAt`. Dashboard: merchants see subprocessor list + DPA status. Alert on new subprocessor. | DPDP §8(1); GDPR Art.28(2) | 🔴 **MUST** | 2 days | Legal + Backend |
| **P6** | **Cross-Border Transfer Safeguards** | Execute SCCs with: OpenAI (US), Resend (US/EU), Meta (Global). Document Transfer Impact Assessment (TIA) for each. Add `transferMechanism` to `Subprocessor`. For India→US: SCC 2021 + supplementary measures (encryption, access controls). | DPDP §16; GDPR Ch.V; Schrems II | 🔴 **MUST** | 5 days | Legal/Founders |
| **P7** | **Data Breach Detection & Notification** | `DataBreach` model: `detectedAt`, `description`, `categories`, `subjectsAffected`, `riskLevel`, `merchantNotifiedAt`, `authorityNotifiedAt`, `status`. Webhook/alert on: unauthorized DB access, abnormal export, ransomware indicators. 72-hr SLA to merchant; authority per DPDP Rules. | DPDP §8(6); GDPR Art.33–34 | 🔴 **MUST** | 3 days | Backend + Security |
| **P8** | **Cookie Consent Banner** | Categories: `essential` (auth, csrf, session), `analytics` (GA, internal), `marketing` (none currently). Banner: granular toggles, "Reject All", "Accept All". Store consent in `CookieConsent` model + cookie. Block non-essential until consent. | DPDP §6; ePrivacy; GDPR Art.7 | 🔴 **MUST** | 2 days | Frontend |
| **P9** | **Age Verification / Child Data Protection** | Merchant onboarding: "Does your brand target individuals under 18?" If yes → require `parentalConsentFlowEnabled` + `ageGateEnabled` in store config. Cart capture: optional `dateOfBirth` field. If DOB < 18 → block marketing channels, require parental consent for transactional. | DPDP §9 | 🟡 **SHOULD** | 2 days | Product + Backend |
| **P10** | **Revenue Attribution → Merchant Webhook** | Move `isRecovered` logic out of CartGain core. Emit `cart.converted` webhook with `cartId`, `orderId`, `value`, `channel`. Merchant endpoint marks recovered. CartGain bills on webhook receipt (idempotent). | Joint controller risk; auditability | 🟡 **SHOULD** | 3 days | Backend |
| **P11** | **Data Subject Request (DSR) Portal** | Merchant dashboard: "Data Requests" tab. End-customer form (public `/privacy/request`): access, correction, erasure, opt-out. Auto-create `DataSubjectRequest` assigned to merchant + CartGain support. SLA tracker (30 days DPDP). | DPDP §17–19; GDPR Art.15–22 | 🟡 **SHOULD** | 5 days | Full-stack |
| **P12** | **Audit Log Enhancement** | `DataAccessLog` → add `lawfulBasis`, `dpaRef`, `subprocessorInvolved`. Immutable append-only (Supabase RLS + pg_audit). Export for merchant audit. | DPDP §8(7); GDPR Art.30 | 🟡 **SHOULD** | 2 days | Backend |
| **P13** | **Merchant Consent Management UI** | Dashboard: "Consent Center" — view opt-in/opt-out per customer, channel, source, proof. Bulk import (CSV) with validation. Export for TRAI/DLT audit. | TRAI/DLT; TCPA; Meta | 🟡 **SHOULD** | 4 days | Frontend + Backend |
| **P14** | **Automated Retention Enforcement** | Cron job (daily): `Cart` anonymization at 90 days (nullify `customerEmail`, `customerPhone`, `customerName`, hash `cartId`), `BargainSession` deletion at 90 days, `DataAccessLog` deletion at 180 days, `VerificationToken` cleanup. Log each run. | DPDP §8(5); GDPR Art.5(1)(e) | 🟡 **SHOULD** | 2 days | Backend |
| **P15** | **Penetration Test & Security Certification** | Engage CREST/EMVCo vendor. Annual pen test. Target ISO 27001 readiness (Statement of Applicability). Publish summary on `/security`. | SPDI Rules; Enterprise trust; DPDP §8(4) | 🟢 **SCALE** | 4 weeks | Security/Founders |

---

## Prisma Schema Changes Required

```prisma
// P1: Lawful Basis & Consent Fields
model Cart {
  // ... existing fields
  lawfulBasis       String?   // consent, legitimate_interest, contract
  consentStatus     String?   // obtained, not_required, pending
  consentProof      Json?     // {source, timestamp, method, recordId}
  consentExpiresAt  DateTime?
}

model Customer {
  // ... existing fields
  marketingConsent  Json?     // {email: bool, sms: bool, whatsapp: bool}
  consentLog        Json[]    // append-only: {channel, action, timestamp, source, proof}
}

// P2: Legal Acceptance
model LegalAcceptance {
  id              String   @id @default(cuid())
  entity          String   // "merchant:{id}" or "customer:{id}"
  documentType    String   // "ToS", "PrivacyPolicy", "DPA", "CookiePolicy"
  documentVersion String   // "2026.08.15"
  acceptedAt      DateTime @default(now())
  ip              String?
  userAgent       String?
  signatureHash   String   // hash of acceptance record
  @@index([entity, documentType])
}

// P3: AI Bargain Approval
model BargainConfig {
  // ... existing fields
  autoAcceptEnabled Boolean @default(false)
}

model BargainApproval {
  id              String   @id @default(cuid())
  sessionId       String   @unique
  storeId         String
  aiDecision      Json     // full AI output
  status          String   // pending, approved, rejected, expired
  requestedAt     DateTime @default(now())
  decidedAt       DateTime?
  decidedBy       String?  // merchant user ID
  @@index([storeId, status])
}

// P4: Opt-In Verification
model OptIn {
  id                  String   @id @default(cuid())
  storeId             String
  customerIdentifier  String   // email or phone (normalized)
  channel             String   // email, sms, whatsapp
  source              String   // checkbox, import, api, checkout
  proof               Json?    // {formId, ip, userAgent, timestamp, consentText}
  obtainedAt          DateTime @default(now())
  expiresAt           DateTime?
  @@unique([storeId, customerIdentifier, channel])
  @@index([storeId])
}

// P5: Subprocessor Tracking
model Subprocessor {
  id                  String   @id @default(cuid())
  name                String
  category            String
  dpaSignedAt         DateTime?
  dpaVersion          String?
  dataLocation        String
  transferMechanism   String?  // SCC, adequacy, derogation
  tiaCompletedAt      DateTime?
  status              String   // active, deprecated, removed
  @@index([status])
}

// P7: Data Breach
model DataBreach {
  id                    String   @id @default(cuid())
  detectedAt            DateTime @default(now())
  confirmedAt           DateTime?
  description           String   @db.Text
  categories            String[] // affected data categories
  subjectsAffected      Int?
  riskLevel             String   // low, medium, high, critical
  merchantNotifiedAt    DateTime?
  authorityNotifiedAt   DateTime?
  status                String   // detected, investigating, notified, resolved
  @@index([status, detectedAt])
}

// P8: Cookie Consent
model CookieConsent {
  id              String   @id @default(cuid())
  sessionId       String?  // anonymous session
  userId          String?  // if logged in
  categories      Json     // {essential: true, analytics: true, marketing: false}
  ip              String
  userAgent       String
  acceptedAt      DateTime @default(now())
  @@index([sessionId])
  @@index([userId])
}

// P11: DSR Portal
model DataSubjectRequest {
  id              String   @id @default(cuid())
  storeId         String
  customerIdentifier String // email/phone
  requestType     String   // access, correction, erasure, portability, objection, restriction
  status          String   // received, processing, completed, rejected
  requestedAt     DateTime @default(now())
  completedAt     DateTime?
  assignedTo      String?  // merchant user ID or CartGain support
  @@index([storeId, status])
}

// P12: Audit Log Enhancement
model DataAccessLog {
  // ... existing fields
  lawfulBasis       String?
  dpaRef            String?
  subprocessorInvolved String?
}
```

---

## Implementation Sequence (Phase 0)

```
Week 1: P1 (schema) → P2 (DPA clickwrap) → P8 (cookie banner)
Week 2: P3 (AI gate) → P4 (OptIn gate) → P7 (Breach model)
Week 3: P5 (Subprocessor model) → P6 (SCC execution - legal) → P9 (Age gate)
Week 4: P10 (Attribution webhook) → P14 (Retention cron) → Testing
```

---

## Dependencies

| Change | Depends On |
|---|---|
| P2 (DPA clickwrap) | P1 (schema for LegalAcceptance) |
| P3 (AI gate) | P1 (BargainConfig field) |
| P4 (OptIn gate) | P1 (OptIn model) |
| P7 (Breach) | P5 (Subprocessor for notification routing) |
| P10 (Webhook) | P1 (lawfulBasis for webhook payload) |
| P11 (DSR) | P1, P12 (audit log for DSR tracking) |
| P14 (Retention) | P1 (consentExpiresAt for retention logic) |