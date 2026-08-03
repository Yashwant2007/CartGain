# Security Incident Response Policy — CartGain

Owner: Yashwant (sole operator). 24x7 contact: security@cart-gain.com

## Severity levels

| Severity | Definition | Examples | Response target |
|---|---|---|---|
| SEV-1 | Active breach / data exfiltration / account takeover | Unauthorized DB access, leaked secrets used, mass PII exposure | < 1 hour |
| SEV-2 | Probable exposure, no confirmed misuse | Secret committed to public repo, brute-force attempts | < 4 hours |
| SEV-3 | Vulnerability, no exploitation | Dependency CVE, missing DMARC, rate-limit gap | < 1 week |

## Roles

- **Incident commander**: Yashwant (sole staff). No other staff exist.
- **External advisors**: Shopify (merchant data breaches must be reported), Supabase support, DPDP Authority (if Indian citizens affected materially).

## Playbook

1. **Detect** — Cloudflare Security Insights, Vercel logs, Supabase audit, merchant reports.
2. **Triage** — confirm severity. Assume worst case (secrets are burned if they touched a public surface).
3. **Contain** (SEV-1/2):
   - Rotate every potentially exposed secret (see `docs/dlp-strategy.md` §4).
   - Disable breached integrations; revoke Shopify tokens per store.
   - Reset passwords; log out all sessions (`NEXTAUTH_SECRET` rotation does this).
4. **Eradicate** — fix root cause (e.g., pre-commit hook blocks env files, add DMARC, patch CVE).
5. **Recover** — restore from backup if needed; verify integrity; redeploy.
6. **Evidence** — keep timestamps, log excerpts (redacted), diff snapshots in a private folder.
7. **Notify**:
   - Merchants whose customer data may be affected: within 72 hours (GDPR) / as required by DPDP Act.
   - Shopify App Store: report via Partner Dashboard if a Shopify API token was exposed.
   - Data subjects: only if actual harm is probable.
8. **Post-incident (≤ 7 days)** — write a short report: timeline, root cause, changes made, lessons. Add preventive control to the repo.

## Mandatory rules

- Never commit secrets. The pre-commit hook blocks `.env*` files.
- Never paste API keys into logs or screenshots.
- Access to production (Vercel/Supabase/Cloudflare/Resend/Shopify) is single-user — any second staff member requires written approval + 2FA.
- All protected-data access is logged (DataAccessLog). Review logs weekly.

## Regulators / contacts

- India DPDP Authority: https://dpdp.gov.in (data breach notifications)
- Shopify Partner support (app data incidents)
- Resend / Supabase / Vercel security contacts
