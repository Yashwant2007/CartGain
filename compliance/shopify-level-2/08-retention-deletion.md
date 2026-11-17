# 08 — Retention and Deletion

Job: `src/app/api/jobs/data-retention/route.ts` (job-authenticated; daily
schedule + external trigger). Policy is mirrored in `/privacy` and
`cartgain-legal/documents/DATA_RETENTION_POLICY.md`.

| Data | Period | Action |
|---|---|---|
| Cart contact/name/customer id/items | 90 days after `abandonedAt` | Set to null/empty |
| Cart token | 90 days | Replace with `anon_<row id>` |
| Encrypted checkout recovery URL | 90 days | Clear; status `EXPIRED_OR_INVALID` |
| Message bodies/provider ids | 90 days | Replace body with retention marker; clear provider id; keep status counts |
| Bargain sessions/messages | 90 days after start | Hard delete |
| Learning outcomes | 90 days | Delete |
| Learning events | Store setting, 180 days default | Delete |
| Experience events | 180 days | Delete |
| `DataAccessLog` | 180 days | Delete |
| Verification tokens | 7 days after expiry | Delete |
| `CustomerDataExport` | 180 days | Delete |
| Opt-out/suppression | While merchant active | Retain to honor choice |

## Safety properties

- The anonymization SQL is additive-compatible: if the checkout-recovery
  migration has not been applied, the job logs a warning and falls back to
  legacy PII clearing instead of failing the whole run.
- Carts with only phone/name (no email) and carts with only an encrypted URL are
  now included.
- `shop/redact` and `app/uninstalled` call `purgeStoreData`; `customers/redact`
  calls `redactCustomer`. Both are store-scoped and audited.
- ⚠️ Late webhook delivery after retention can create a new cart from the same
  token; that new row is treated as a fresh record and is subject to the same
  retention clock.

## Operator evidence to attach

- A production `POST /api/jobs/data-retention` response showing non-zero
  anonymized carts/messages.
- A SQL sample proving a retained cart has no email/phone/name and no encrypted
  URL.
