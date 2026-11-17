# 03 — Access Control and Tenant Isolation

## Current operating model

CartGain is a single-operator service. There are no shared staff accounts and no
merchant↔merchant administration UI. “RBAC” is therefore merchant isolation plus
API-key scopes plus provider-level operator controls, not a staff role hierarchy.

## Merchant authentication

- NextAuth credentials + Google + email; bcrypt password hashes.
- Optional TOTP 2FA (`src/lib/totp.ts`, `/api/auth/2fa/*`).
- JWT sessions carry `tokenVersion`; password reset/change increments it and
  revokes existing sessions (`src/lib/auth.ts`).
- Embedded Shopify admin sessions use App Bridge ID tokens; the validator
  enforces `iss`, `dest`, `aud` and the shop hostname (`src/lib/shopify-*.ts`).

## API keys

- Keys are hashed at rest (`src/lib/api-keys.ts`); the plaintext is shown once.
- Scopes include read/write; write is required for mutations
  (`hasPermission` in `src/lib/auth-context.ts`).
- Tenant tests exist for cart, timeline, recipient and key isolation.

## Store scoping

Every merchant route resolves the store with `where: { id, userId }` (or
`storeId` + owner) before reading/writing. Examples:

- `src/app/api/carts/route.ts`
- `src/app/api/carts/[id]/timeline/route.ts`
- `src/app/api/recipients/route.ts`
- `src/app/api/bargain/sessions/[id]/route.ts`
- `src/app/api/data-protection/export/route.ts`

Public storefront routes do not use a merchant session; they require an
unguessable cart/checkout token and never accept a `storeId` as authorization.

## Provider / operator access

- Vercel, Supabase, Cloudflare, GitHub, Shopify Partner, Resend, Meta: operator
  only per `docs/staff-access-policy.md`.
- Production DB is not publicly exposed; app access is through serverless
  functions.
- ⚠️ Attach screenshots of current role assignments and MFA enrollment.

## Known limitation to disclose honestly

Supabase RLS is not enabled on every table; the app relies on server-side Prisma
and explicit `userId`/`storeId` scoping. See `docs/security/rls-plan.md`. This is
defense-in-depth work, not a substitute for the tenant checks above.
