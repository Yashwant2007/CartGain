# 00 — Cover and Approval Status

## App identity

- Public app: `CARTGAIN`, `gid://shopify/App/390792151041`
- Client id: `67beb1794fab10553102c134b63e1277`
- Custom distribution app: `850b64332c8925413d0d6d8d39ede515`
- Production URL: `https://cart-gain.com`
- Admin API version: `2026-04` (GraphQL only)

## Requested protected customer data

Level 2 is requested only for what the product uses:

| Data | Use | Stored? |
|---|---|---|
| Name | Personalise recovery and identify the shopper | Yes, until 90-day retention |
| Email | Email recovery, consent records, DSR | Yes, until 90-day retention |
| Phone | WhatsApp recovery and consent matching | Yes, until 90-day retention |
| `AbandonedCheckout.abandonedCheckoutUrl` | Resume the shopper's own checkout | Only AES-256-GCM ciphertext, cleared at retention |
| Street address | Not used | **Not requested, not persisted** |

## Deadline and current state

- Shopify requires Level 2 for `AbandonedCheckout.abandonedCheckoutUrl` from
  **2026-11-23**.
- ⛔ **Approval is not yet confirmed.** The app is in App Store review, so the
  Dev Dashboard protected-data page is unavailable. Only Shopify Partner Support
  can confirm or escalate.
- ✅ Code is ready either way: the URL is isolated in an optional GraphQL query;
  a denial records capability state and never deletes core checkout data;
  checkout links fall back safely.

## Blocking evidence (operator must attach)

| Item | Owner | Status |
|---|---|---|
| Shopify Partner Support confirmation of Level 2 | Operator + Shopify | ⛔ pending |
| Production DB encryption-at-rest statement | Supabase dashboard | ⚠️ attach |
| Encrypted backup + restore-test log | Backup provider / GitHub Actions | ⚠️ attach |
| MFA/passkey enrollment on Vercel, Supabase, Cloudflare, GitHub, Shopify, DNS, email | Operator | ⚠️ attach |
| `PRODUCTION_DB_HOSTS` set in Vercel | Operator | ⚠️ attach |
| Fresh four-scope install + billing smoke test | Operator | ⚠️ pending |

Do not mark any row complete without the actual screenshot, log or provider
statement.
