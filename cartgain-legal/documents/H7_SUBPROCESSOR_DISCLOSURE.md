# H.7 — CARTGAIN SUBPROCESSOR & DATA-SHARING DISCLOSURE

> **Version:** 2026.08.15 | **Effective:** 2026-08-16
> **Published at:** `/subprocessors` | **Referenced in:** Privacy Policy §6, DPA Schedule 2

---

## 1. PURPOSE

Transparency about third parties who process Customer personal data on CartGain's behalf. Enables Merchant objection right (14 days).

---

## 2. CURRENT SUBPROCESSORS

| Subprocessor | Legal Entity | Category | Data Categories | Purpose | Location | DPA Status | Transfer Safeguard |
|---|---|---|---|---|---|---|---|
| **Supabase** | Supabase Inc. | Database, Auth, Storage | All Platform data | Primary data store | AWS Mumbai (ap-south-1) | ✅ Executed | N/A (India) |
| **Vercel** | Vercel Inc. | Hosting, Edge, CDN | Logs, metrics, cache | Application delivery | Global | ✅ Executed | SCC (EU data) |
| **MSG91** | MSG91 Communications Pvt Ltd | SMS Gateway | Phone, message content | SMS delivery | India | ⚠️ **Negotiating** | N/A (India) |
| **Resend** | Resend Inc. | Email Gateway | Email, message content | Email delivery | US (Virginia) / EU (Frankfurt) | ⚠️ **Negotiating** | SCC + TIA |
| **Meta (WhatsApp)** | Meta Platforms Ireland Ltd / Meta Platforms Inc. | WhatsApp Business API | Phone (hashed), message, template params | WhatsApp delivery | Global | ✅ Meta DPA | Meta SCC / Adequacy |
| **Razorpay** | Razorpay Software Pvt Ltd | Payment Gateway | Billing, payment tokens | Subscription billing | India | ✅ Executed | N/A (India) |
| **OpenAI** | OpenAI LLC / OpenAI OpCo LLC | AI API | Customer name, cart, messages, history (per request) | AI content generation | US | ⚠️ **API Terms + DPA Requested** | SCC + TIA (zero-retention) |
| **Upstash** | Upstash Inc. | Redis, Queue | Job payloads, tokens, cache | Background jobs, rate limits | AWS Mumbai | ✅ Executed | N/A (India) |
| **[Error Monitoring]** | [TBD — Sentry / Datadog / etc.] | Error Tracking | Stack traces, context (may include PII) | Monitoring, debugging | US/EU | ⚠️ **Pending Selection** | SCC + TIA |

---

## 3. DATA FLOW SUMMARY

```
Customer Cart Data (Merchant → CartGain API)
    │
    ├─→ Supabase (storage, query)
    ├─→ ProcessAbandonedCarts (logic)
    │     ├─→ MSG91 (SMS) → Customer
    │     ├─→ Resend (Email) → Customer
    │     ├─→ Meta WhatsApp (WhatsApp) → Customer
    │     ├─→ OpenAI (AI content) → Prompt + Response (ephemeral)
    │     └─→ AI Bargain (session) → OpenAI → Discount Code → Shopify
    └─→ Analytics (aggregated) → Dashboard
```

**No data sold.** No advertising use. No cross-merchant identifiable analytics.

---

## 4. CHANGE NOTIFICATION

- **New Subprocessor:** Email + Dashboard notice ≥14 days before onboarding.
- **Material Change** (category, location, data scope): Same notice.
- **Objection:** Write to privacy@cart-gain.com within 14 days. Good-faith resolution. If unresolved → Merchant may terminate for convenience.

---

## 5. SUBPROCESSOR DPA STATUS TRACKING

| Subprocessor | DPA Signed | SCC Executed | TIA Completed | Last Review | Next Review |
|---|---|---|---|---|---|
| Supabase | ✅ 2025.01 | N/A | N/A | 2026.06 | 2027.01 |
| Vercel | ✅ 2025.03 | ✅ 2025.03 | ✅ 2025.03 | 2026.06 | 2027.03 |
| MSG91 | ⚠️ In progress | N/A | N/A | — | — |
| Resend | ⚠️ In progress | ✅ 2026.07 | ✅ 2026.07 | — | — |
| Meta | ✅ 2025.06 (Meta DPA) | ✅ Meta | ✅ Meta | 2026.06 | 2027.06 |
| Razorpay | ✅ 2025.02 | N/A | N/A | 2026.06 | 2027.02 |
| OpenAI | ⚠️ Requested | ✅ 2026.07 | ✅ 2026.07 | — | — |
| Upstash | ✅ 2025.04 | N/A | N/A | 2026.06 | 2027.04 |
| Error Monitoring | ⚠️ Pending | — | — | — | — |

---

## 6. CONTACT

privacy@cart-gain.com | legal@cart-gain.com