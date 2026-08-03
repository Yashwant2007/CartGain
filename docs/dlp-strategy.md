# Data Loss Prevention (DLP) Strategy — CartGain

Applies to all personal data processed by CartGain for merchants (DPDP Act 2023, GDPR).

## 1. Data inventory (what we store & where)

| Data | Where | Purpose |
|---|---|---|
| Customer email/phone/name | Supabase Postgres (Cart, Message, Customer, OptOut) | Cart recovery messaging |
| Cart items / totals | Supabase Postgres | Recovery + analytics |
| Bargain sessions/messages | Supabase Postgres | AI price negotiation |
| Store OAuth tokens | Supabase Postgres (encrypted AES-256-GCM via ENCRYPTION_KEY) | Shopify API access |
| IP addresses | rate-limit Redis keys (ephemeral, TTL) | Abuse prevention |

## 2. Controls in place

- **Encryption at rest**: ENCRYPTION_KEY (AES-256-GCM) for stored secrets; DB-level encryption via Supabase (managed Postgres).
- **Encryption in transit**: HTTPS everywhere (TLS via Cloudflare + Vercel); Shopify OAuth over TLS.
- **Access logs**: every protected-data access is written to `DataAccessLog` (see `src/lib/data-protection.ts`) with PII redaction.
- **Minimum data**: only fields required for recovery are stored; nothing else is collected.
- **Retention**: cron job `/api/jobs/data-retention` anonymizes cart PII after 90 days, deletes bargain sessions/logs per policy (see vercel.json crons, daily 03:00 UTC).
- **RLS**: `scripts/supabase-rls.sql` enables row-level security deny-all on all public tables (app connects via Prisma service role).
- **Opt-out**: `src/app/api/opt-out` records suppression; all channels check it before sending.
- **Env separation**: `.env.example` documents vars; production secrets live only in Vercel env. NEVER commit `.env*` files (pre-commit hook blocks them).
- **Backups**: Supabase automatic daily backups; PITR recommended (see below).

## 3. Gaps to close (owner actions)

- [ ] Enable PITR (point-in-time recovery) in Supabase for backups.
- [ ] Enforce 2FA for Supabase/Vercel/Cloudflare/Shopify admin accounts.
- [ ] Keep `scripts/supabase-rls.sql` applied after any schema migration.

## 4. Breach containment

1. Rotate ALL secrets (ENCRYPTION_KEY, DATABASE_URL, provider tokens).
2. Disable affected store connections.
3. Follow incident response policy (`docs/incident-response.md`).
