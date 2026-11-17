# 05 — Data Loss Prevention

Policy: `docs/security/dlp-policy.md`, `docs/security/export-controls.md`.

## Prohibited

- Exporting merchant/customer data to personal drives, local machines or
  unapproved cloud storage.
- Copying production data into development, tests, previews or ad-hoc databases.
- Sending customer contact data, tokens or recovery URLs to an AI provider.
- Writing raw emails, phones, tokens, secrets or checkout URLs to logs,
  analytics, alerts or error trackers.
- Using production secrets in test/staging.

## Implemented controls

| Control | Evidence |
|---|---|
| Log redaction by key and value shape | `redactSensitive()` in `src/lib/data-protection.ts`; test `data-protection.test.ts` |
| Token correlation without token exposure | `logReference()` SHA-256 prefix in `src/lib/logging.ts`; used for cart/checkout sync errors |
| No tokens in DSR export | `src/lib/data-export.ts` omits `Cart.cartId` and `BargainSession.cartToken` |
| AI minimization | recovery facts/prompts exclude contact data; `recovery-minimization.test.ts` |
| No merchant bulk export UI | analytics/campaign CSV controls removed; `docs/security/export-controls.md` |
| DSR download is owner-only | `src/app/api/data-protection/export/route.ts` checks store owner and logs the download |
| Environment separation | `src/lib/env-separation.ts` + `src/lib/db.ts` guard |
| Retention redaction | `src/app/api/jobs/data-retention/route.ts` clears PII, recovery URLs and message bodies |

## Known gaps / operator evidence

- ⚠️ Provider-side log retention and access must be confirmed in Vercel,
  Supabase and any error-monitoring provider.
- ⚠️ No DLP agent on operator endpoints; policy relies on access control and
  audited workflows.
- ⛔ RLS coverage is partial (`docs/security/rls-plan.md`); disclose accurately.
