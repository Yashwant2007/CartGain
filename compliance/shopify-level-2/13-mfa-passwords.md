# 13 — Authentication, Passwords and MFA

## Merchant/app accounts

- Passwords are hashed with bcrypt cost 12; plaintext is never stored or logged.
- Policy: minimum 8 characters with at least one uppercase letter and one digit
  (`passwordPolicy` in `src/lib/auth-utils.ts`; mirrored in signup/reset UI).
  Consider raising to 12+ for new accounts; any change must update the UI copy
  and tests together.
- Password reset tokens are single-use, scoped (`password-reset:` prefix) and
  expire; reset increments `tokenVersion`, revoking all sessions.
- Optional TOTP 2FA is available per user (`src/lib/totp.ts`,
  `/api/auth/2fa/*`). It is not enforced for every account yet.
- Sessions are signed JWTs with a short lifetime; `tokenVersion` provides
  server-side revocation on password change/deletion.
- Login throttling / lockout is implemented in the auth route.

## Operator/provider accounts

The service has one operator. Level 2 staff-password/MFA evidence is therefore
mostly provider-level:

| Provider | MFA requirement | Status |
|---|---|---|
| Vercel | Passkey/TOTP | ⚠️ attach proof |
| Supabase | TOTP | ⚠️ attach proof |
| Cloudflare / DNS | TOTP + hardware key preferred | ⚠️ attach proof |
| GitHub | TOTP/passkey; 2FA enforced | ⚠️ attach proof |
| Shopify Partner | TOTP | ⚠️ attach proof |
| Resend | TOTP | ⚠️ attach proof |
| Meta Business | TOTP + business verification | ⚠️ attach proof |
| Email account | TOTP/passkey | ⚠️ attach proof |

## Gaps to disclose

- App-level TOTP is optional, not mandatory; there are no staff accounts to
  enforce it on. If staff are added, require 2FA at invite time.
- TOTP secrets are stored in the DB; at-rest protection relies on provider
  encryption. Application-layer encryption of TOTP secrets is a backlog item.
- ⚠️ No SSO/SAML and no central identity provider; acceptable for a
  single-operator service but must be described accurately.
