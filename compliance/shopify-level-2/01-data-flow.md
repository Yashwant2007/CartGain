# 01 — Data Flow and Trust Boundaries

```
Shopify storefront / checkout
  │  carts/*, checkouts/*, orders/*, refunds/*, customers/*, app/* webhooks
  ▼
HMAC verification (src/app/api/webhooks/shopify/route.ts)
  │  body-only HMAC + signed-payload domain match; rejects mismatched shop header
  ▼
CartGain API (Vercel bom1, Next.js App Router)
  │  tenant check on every merchant request (userId → storeId)
  ├─ Prisma ──► Supabase Postgres (aws-1-ap-south-1) — primary datastore
  ├─ AI ──────► primary provider; Groq fallback — facts only, no email/phone/address
  ├─ Email ───► Resend / SMTP — recovery + DSR notification
  ├─ WhatsApp ► Meta Cloud API — consented recipients only
  └─ Shopify Admin GraphQL (2026-04)
       ├─ abandoned checkouts (core query; optional URL query)
       ├─ products / images / prices
       ├─ customer name/email/phone resolution
       └─ discount creation (write_discounts) + Shopify Billing
```

## Trust boundaries

1. **Shopify → CartGain:** untrusted until HMAC verification. The signed payload
   domain is authoritative; a header/domain mismatch is rejected `401`.
2. **Browser → CartGain:** public storefront endpoints accept only unguessable
   cart/checkout tokens, never a merchant session; CORS and per-IP/contact rate
   limits apply.
3. **Merchant → CartGain:** NextAuth session or hashed API key; every store query
   is scoped by `userId` or `storeId`. Shopify embedded requests additionally use
   App Bridge session tokens.
4. **CartGain → AI:** only trusted facts (store name, first name, item names,
   totals, authorised offer, stage). No email, phone, address, token, or full
   recovery URL.
5. **CartGain → logs/alerting:** only redacted metadata or hashed references; no
   raw contact data, tokens, or recovery URLs.

## Recovery URL handling (Level 2)

`fetchAbandonedCheckoutsDetailed` (src/lib/shopify.ts) runs:

- Query A: checkout identity, items, totals, contact, timestamps — **never**
  selects `abandonedCheckoutUrl`.
- Query B: `id` + `abandonedCheckoutUrl` only. A Level 2 denial leaves Query A
  intact and records `Store.abandonedCheckoutUrlAccess = ACCESS_DENIED` for 6h.

A validated HTTPS URL is stored only as AES-256-GCM ciphertext. The non-secret
checkout token may be kept in `Cart.cartId` for link building, and is replaced
with `anon_<row id>` at retention. If no safe resume link exists, tracked links
remain inside CartGain (`/cart/<id>`) and the CTA says “Continue Shopping”; no
`/cart/<checkoutId>` URL is fabricated.
