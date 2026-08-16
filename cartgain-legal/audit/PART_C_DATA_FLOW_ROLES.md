# PART C — DATA FLOW & LEGAL ROLES

---

## Processing Activities & Role Analysis

| Processing Activity | Personal Data | CartGain Role | Merchant Role | End-Customer (Data Principal) | Legal Basis (CartGain) | Legal Basis (Merchant) |
|---|---|---|---|---|---|---|
| **Merchant onboarding / account management** | Name, email, phone, company, billing, login credentials | **Controller** (determines purpose: SaaS delivery, billing, support) | Data Subject | N/A | Contract (ToS) — §6(1)(b) DPDP / Art.6(1)(b) GDPR | N/A |
| **Abandoned cart ingestion (API/webhook)** | Customer name, email, phone, cart items, value, IP, device | **Processor** (acts on merchant instruction via campaign config) | **Controller** (determines *which* carts, *when*, *what* messages) | Data Principal | Legitimate interest (service delivery per contract) — §6(1)(f) DPDP / Art.6(1)(f) GDPR | Consent or Legitimate Interest (merchant must establish) |
| **Recovery messaging (Email/SMS/WhatsApp)** | Customer contact, cart link, personalized content, discount code | **Processor** (sends per merchant campaign rules) | **Controller** (chooses channel, timing, content, consent) | Data Principal | Legitimate interest (contractual obligation to merchant) | **Consent required** for SMS/WhatsApp (TCPA/TRAI/Meta); Email: consent or soft-opt-in |
| **AI message generation** | Customer name, cart items, value, history → sent to OpenAI | **Processor** (subprocessor: OpenAI) | **Controller** (opts into AI optimization) | Data Principal | Legitimate interest (service improvement) | Legitimate interest (if disclosed in merchant privacy notice) |
| **AI Bargain negotiation** | Customer messages, offers, product info, session data → OpenAI | **Joint Controller risk** (CartGain defines negotiation logic, floor, personas) | **Controller** (sets floor, max discount, persona, enabled products) | Data Principal | Legitimate interest (feature delivery) | Consent for automated decision-making (GDPR Art.22; DPDP unclear) |
| **Analytics / reporting** | Aggregated cart/recovery metrics, merchant usage | **Controller** (own analytics product) | Data Subject (merchant) | N/A (aggregated) | Legitimate interest / Contract | N/A |
| **Billing / revenue share** | Merchant billing, recovered cart values, invoices | **Controller** (determines pricing, calculates share) | Data Subject | N/A | Contract | N/A |
| **Support / communications** | Merchant tickets, emails, chat logs | **Controller** | Data Subject | N/A | Contract / Legitimate interest | N/A |

---

## Key Role Distinctions

### 1. CartGain is Controller for:
- Merchant account data, billing, platform analytics, support
- AI model improvement (if any cross-merchant learning — currently **none** per code)
- Marketing communications to Merchants

### 2. CartGain is Processor for:
- End-customer cart data, recovery messages, AI bargain sessions
- *Only when acting on documented merchant instructions* (campaign config, DPA)

### 3. Joint Controller Risk — AI Bargain:
- CartGain defines *how* negotiation works (personas, concession logic, floor calculation)
- Merchant sets parameters (floor, max discount, persona, enabled products)
- **Recommendation**: DPA Schedule clarifies CartGain as Processor with *limited* discretion; Merchant as Controller for outcomes

### 4. Subprocessors:
- OpenAI, Resend, Meta, MSG91, Supabase, Vercel, Upstash, Razorpay
- All are Processor-to-Processor (CartGain = Controller vis-à-vis them for end-customer data)

---

## Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Merchant   │────▶│  CartGain   │────▶│  Subprocessors   │
│ (Controller)│     │ (Processor) │     │ (Sub-processors) │
└─────────────┘     └─────────────┘     └──────────────────┘
       │                    │                      │
       │ Instructions       │ Processing           │ Services
       │ (Campaign config)  │ per instructions     │ (delivery, AI, etc.)
       ▼                    ▼                      ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Customer   │◀───▶│  Messages   │     │  OpenAI, Meta,   │
│ (Data       │     │  (Email,    │     │  MSG91, Resend,  │
│  Principal) │     │  SMS, WA)   │     │  etc.            │
└─────────────┘     └─────────────┘     └──────────────────┘
```

---

## Responsibility Matrix

| Responsibility | Merchant (Controller) | CartGain (Processor) |
|---|---|---|
| **Lawful basis for Customer data** | ✅ Determine, document, maintain proof | ❌ Not responsible; provides tools |
| **Privacy notice to Customers** | ✅ Provide clear, accessible notice | ❌ Not responsible; provides template reference |
| **Consent collection (WhatsApp/SMS/Email)** | ✅ Collect, record, refresh | ⚠️ Provides OptIn model + verification gate |
| **Opt-out honor** | ✅ Ultimate responsibility | ✅ Auto-suppression via `OptOut` table; real-time |
| **Data accuracy** | ✅ Ensure data provided to CartGain is accurate | ⚠️ Processes as received; flags anomalies |
| **Security of Platform** | ⚠️ Secure own credentials, team access | ✅ Infrastructure, encryption, access controls, audits |
| **Subprocessor management** | ✅ Object to new subprocessors (14 days) | ✅ Execute DPAs, notify, maintain list |
| **Data Subject Requests (DSR)** | ✅ Receive, coordinate, respond | ✅ Assist (access, export, delete via API/dashboard) |
| **Breach notification** | ✅ Notify authorities (Controller duty) | ✅ Notify Merchant within 72 hrs; assist |
| **DPIA / Transfer Impact Assessment** | ✅ For own processing | ✅ For Processor activities (CartGain-led) |
| **AI Bargain configuration** | ✅ Set floor, max discount, persona, enabled products | ⚠️ Executes within bounds; logs all decisions |

---

## Legal Basis Mapping (DPDP Act §6)

| Processing Purpose | CartGain Basis | Merchant Basis (Controller) |
|---|---|---|
| Merchant authentication/account | Contract (§6(1)(b)) | N/A |
| Cart ingestion/storage | Legitimate interest (§6(1)(f)) | Consent or Legitimate interest |
| Recovery messaging | Legitimate interest (§6(1)(f)) | **Consent required** for WA/SMS |
| AI content generation | Legitimate interest (§6(1)(f)) | Legitimate interest (with notice) |
| AI Bargain negotiation | Legitimate interest (§6(1)(f)) | Consent for automated decision-making |
| Analytics (merchant) | Legitimate interest / Contract | N/A |
| Billing/revenue share | Contract | N/A |
| Security/fraud prevention | Legitimate interest (§6(1)(f)) | N/A |