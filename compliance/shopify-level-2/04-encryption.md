# 04 — Encryption

## In transit

- All app, webhook, provider and Admin API traffic uses HTTPS/TLS.
- HSTS is set by the hosting platform; `NEXTAUTH_URL`/`NEXT_PUBLIC_APP_URL` are
  HTTPS in production.
- Webhooks must pass Shopify HMAC-SHA256 before any processing.

## At rest

| Data | Protection |
|---|---|
| Database volume / backups | Supabase managed encryption (⚠️ attach provider statement) |
| Shopify access tokens | AES-256-GCM, `src/lib/encryption.ts` |
| Per-store webhook secret | AES-256-GCM |
| `AbandonedCheckout.abandonedCheckoutUrl` | AES-256-GCM; skipped if key unavailable |
| API keys | SHA-256 hash only; plaintext shown once |
| Merchant passwords | bcrypt |
| TOTP secrets | Stored in DB; ⚠️ provider DB encryption applies (app-layer TOTP secret encryption is a backlog item) |
| DSR exports | Stored in DB under provider encryption; deleted at 180 days |

`src/lib/encryption.ts` uses a key derived from `ENCRYPTION_KEY`
(`scrypt`, fixed app salt) and the `iv:authTag:ciphertext` hex format. There is
one implementation; no parallel crypto library was introduced.

## Secrets

- Secrets live only in Vercel/environment variables; `.env*` files are ignored
  by git. ⚠️ Rotation evidence must be attached by the operator.
- `.env.example` contains placeholders only.
- No secret is written to logs, analytics, AI prompts or API responses.

## Recovery URL specifics

- Only HTTPS URLs with a valid Shopify path/token are accepted
  (`src/lib/recovery/checkout-url.ts`).
- The full URL is never returned by a merchant API, embedded in an email body,
  logged, or exported. Only a non-secret checkout token extracted from it may be
  used to build the link.
- If `ENCRYPTION_KEY` is unavailable the URL is not persisted; the cart still
  works through the safe fallback.
