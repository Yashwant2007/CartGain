# 15 — Automated Test Evidence

Commands were run from the repository root on 2026-11-17. Update the counts before
each submission; do not paste stale numbers.

| Area | Test file(s) | Status |
|---|---|---|
| Environment separation | `src/lib/__tests__/env-separation.test.ts` | ✅ |
| Log/token redaction | `src/lib/__tests__/logging.test.ts`, `src/lib/__tests__/data-protection.test.ts` | ✅ |
| AI recovery minimization | `src/lib/conversation/__tests__/recovery-minimization.test.ts` | ✅ |
| Retention anonymization/redaction/compat fallback | `src/app/api/jobs/data-retention/__tests__/retention.test.ts` | ✅ |
| DSR export token absence | `src/lib/__tests__/data-export.test.ts` | ✅ |
| Customer redact / store purge | data-deletion + Shopify webhook suites | ✅ |
| Shopify privacy webhooks / checkout capture | `src/app/api/webhooks/shopify/__tests__/*` | ✅ |
| Consent gate / opt-out / multi-channel rounds | `src/lib/jobs/__tests__/*` | ✅ |
| Tenant isolation / API keys | auth, cart, recipient and session route suites | ✅ |
| Recovery URL validation and fallback | `src/lib/recovery/__tests__/checkout-url.test.ts`, link/cart suites | ✅ |

## Commands

```
npx tsc --noEmit
npm run lint
npm test -- --silent
```

## Full-suite result

- Full Jest: **177 suites / 1850 tests passed** (`npx jest --silent`).
- Typecheck: **passed** (`npm run typecheck` / `tsc --noEmit`).
- Lint: **passed** (`npm run lint`, no warnings or errors).
- Production build: **passed** (`npm run build`; 43 static pages, Prisma client generated).

## What these tests prove

- No raw checkout/cart token is written to a log statement.
- DSR export cannot leak a cart or bargain token.
- AI recovery facts cannot include email/phone/address/token.
- Retention clears PII and message bodies, and does not fail on the legacy
  schema before the checkout-recovery migration is applied.
- Environment guards reject obvious production/test mixing.

They do **not** prove provider-side controls (MFA, backups, encryption at rest,
log retention). Those are `⚠️` evidence items for the operator.
