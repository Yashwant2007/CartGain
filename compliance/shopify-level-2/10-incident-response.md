# 10 — Incident Response

Full plan: `docs/incident-response.md`.

## Severity and targets

| Severity | Example | First response |
|---|---|---|
| SEV-1 | Active breach, data exfiltration, account takeover | < 1 hour |
| SEV-2 | Exposed credential, misdirected recovery message at scale | Same business day |
| SEV-3 | Isolated failed send or non-sensitive defect | Next business day |

## Steps

1. **Detect** — provider alert, `DataAccessLog` review, error tracker, merchant
   report, Shopify Partner notice.
2. **Contain** — revoke sessions (`tokenVersion`), rotate the affected secret,
   disable a channel/job, force `emergencyPaused`, restrict provider access.
3. **Assess** — identify affected stores/customers, data categories, time window
   and whether the data was encrypted/undelivered. Use hashed references from
   logs, never raw tokens.
4. **Notify** — merchant without undue delay; Shopify Partner Support and any
   regulator per the DPA/legal requirements. Do not speculate about scope.
5. **Eradicate/recover** — patch, rotate, restore from an encrypted backup if
   needed, verify with health checks and a test store.
6. **Review** — write a timeline, add a regression test, update the DLP/incident
   policy and evidence pack.

## Contacts

- Incident commander: Yashwant (sole operator).
- Shopify Partner Support for protected-data/API issues.
- Provider consoles: Vercel, Supabase, Cloudflare, GitHub, Resend, Meta,
  Shopify Partner.

## Evidence

- `docs/incident-response.md`
- `src/lib/alerter.ts` and `src/lib/observability/logger.ts` for alert/error
  persistence.
- ⚠️ Attach a dated tabletop exercise or a real incident postmortem (if any). No
  fabricated exercise is claimed here.
