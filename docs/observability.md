# Production Observability & Recovery — CartGain

Applies to production (https://cart-gain.com). Owner: Yashwant (sole operator).
Pairs with `docs/incident-response.md` (security incidents) — this document covers
*operational* health, uptime, and data recovery.

## 1. What "healthy" means

| Surface | Endpoint | Requirement |
|---|---|---|
| Liveness / deps | `GET /api/health` | `200`. `checks.database.status = ok`, `checks.redis.status` ≠ `error`. `environment`/`release` must match the current Vercel deployment. |
| Business pulse | `GET /api/system/metrics` | `200` with `x-job-secret: $JOB_SECRET`. Shows MRR, recovered carts, revenue, sent messages, error counts. |
| Server errors | `ErrorLog` table | Errors persist grouped by `signature`. Empty-ish = healthy. |
| Frontend errors | `ErrorLog` where `component = frontend` | Only genuinely surprising client crashes should appear. |
| Funnel | `ProductEvent` table | `cartgain_*` events map the merchant lifecycle (signup → connect → onboarding → billing → usage → recovery). |

## 2. Runtime environment catalog (Vercel production)

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Yes | Supabase Postgres (transaction pooling / direct). |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Yes | Auth sessions (base URL `https://cart-gain.com`). |
| `ENCRYPTION_KEY` | Yes | Encrypts stored Shopify tokens. |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | Yes | Shopify OAuth + app proxy. |
| `SHOPIFY_OAUTH_STATE_SECRET` | Yes | Signs OAuth state tokens. |
| `WHATSAPP_APP_SECRET` | Yes* | Verifies `X-Hub-Signature-256` on inbound WhatsApp webhooks (*fails closed* — set it or inbound messages 401). |
| `WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | No | Outbound WhatsApp. |
| `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` | No | Outbound SMS. |
| `RESEND_API_KEY`, `FROM_EMAIL` | Yes | Email delivery. |
| `OPENAI_API_KEY` | Yes | AI content. |
| `AI_FALLBACK_API_KEY`, `_BASE_URL`, `_MODEL` | No | Fallback AI tier (default Groq). |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Yes | Billing. |
| `JOB_SECRET` (or `CRON_SECRET`) | Yes | Guards cron/job + metrics endpoints. |
| `ALERT_EMAIL` | Yes | Alert destination for CRITICAL + error-spike emails. |
| `APP_DATA_ENV` | No | `production`/`preview` override for env classification. |
| `ENABLE_DEV_ANALYTICS` | No (dev only) | Record `cartgain_*` events outside production. |
| `ALLOW_TEST_ENDPOINTS` | No | Enables test endpoints. Keep unset in production. |

`/api/health` reports required+optional vars collectively as `['N']` on purpose —
never reveals *which* are missing to an attacker.

## 3. Observability surfaces (how to investigate)

- **Every API request** to `/api/*` gets header `x-request-id` (trace id) injected by
  `src/middleware.ts`. It flows into server logs and `ErrorLog.traceId`.
- **Server errors** — `captureError()` in `src/lib/observability/logger.ts` persists to
  `ErrorLog` with `component::operation::error-name` signature, release, environment,
  method, path, status, trace id. Logs survive store purge (no relations, sanitized).
- **Client errors** — `ClientErrorBoundary` (root layout) + `POST /api/client-error`
  write `component = frontend` rows. Rate limited per IP, truncated, capped/session.
- **Alerts** (email → `ALERT_EMAIL`):
  - CRITICAL error → 1 email per `component::operation`, 10-min Redis cooldown
    (falls back to in-process cooldown if Redis is down).
  - Spike → >20 errors from one component in an hour → 1 email per component,
    15-min cooldown.
- **Funnel events** — `track()` in `src/lib/analytics/track.ts`. Production-only
  (or `ENABLE_DEV_ANALYTICS=true`). Strict name rule + sanitized properties.
  Client-fired events restricted to the onboarding pair via `/api/analytics/events`.

### Event allowlist (recorded today)

`cartgain_signup_completed`, `cartgain_shopify_connect_started`,
`cartgain_shopify_oauth_completed`, `cartgain_onboarding_started`,
`cartgain_onboarding_completed`, `cartgain_billing_started`,
`cartgain_subscription_activated`, `cartgain_campaign_created`,
`cartgain_recovery_message_sent`, `cartgain_cart_recovered`.

## 4. External call timeouts (headers intended to never hang)

All outbound calls are bounded so a dead provider can't pin a function:

- Shopify admin/GraphQL API calls — `AbortSignal.timeout(5000–10000)` (`src/lib/shopify.ts`).
- OpenAI primary/fallback — client `timeout: 20000/10000` (`src/lib/ai-client.ts`).
- MSG91 (SMS send/DLR) — `AbortSignal.timeout(10000/5000)` (`src/lib/services/sms.ts`).
- Meta WhatsApp send — `AbortSignal.timeout(10000)` (`src/lib/services/whatsapp.ts`).
- Resend (email) — SDK default 10s. Razorpay — SDK default 90s.

## 5. Backups & recovery (RPO / RTO)

Postgres is hosted on Supabase (managed). There is **no nightly pg_dump**: recovery
comes from Supabase's managed backups + PITR.

| Metric | Target | Source |
|---|---|---|
| RPO (max data loss) | ≤ 5 minutes | Supabase PITR (continuous) |
| RTO (time to readable DB) | ≤ 1 hour | Supabase restore to a new project + repoint `DATABASE_URL` |
| Log/anonymized data | not time-critical | Rebuilt from source traffic; `ErrorLog`/`ProductEvent` are convenience, not source of truth |

**Verify quarterly (and after any infrastructure change):**
1. Dashboard → project → **Database → Backups**: confirm weekly + daily backups exist.
2. **Enable PITR** in Supabase (continuous backups, 7-day window).
3. Restore test (offline only, on a scratch project): pick the latest backup or a PITR
   point → **Restore** → new project → run `SELECT 1` and a row-count sanity query →
   then **delete the scratch project**.
4. Record the result (date, backup taken, restore duration) in this repo's `docs/`.

**Restore procedure (worst case):**
1. Supabase → Database → Backups → Restore (or PITR point for < last backup).
2. Create scratch project, let restore finish.
3. Verify: `products`/`carts` counts sane, latest `subscription.updatedAt` recent.
4. In Vercel → production env, point `DATABASE_URL` + `DIRECT_URL` at the restored
   project, deploy, run `/api/health` (database must be `ok`).
5. Do **not** destroy the broken database until the new one has served
   production traffic for 24h with no missing-data issues.

## 6. Uptime monitoring

Scheduled in the Vercel dashboard: `vercel.json` cron hits `/api/health` daily at
06:00 UTC (Hobby plan caps crons at one per day). UptimeRobot/Cloudflare
health-check can poll the same JSON endpoint (expect `200`).

Operational checklist (monthly):
- [ ] `/api/health` green; `release` short-sha matches latest deploy.
- [ ] `GET /api/system/metrics` (with `x-job-secret`) returns sane business numbers.
- [ ] Zero unexpected `ErrorLog` spikes in the last 7 days.
- [ ] WhatsApp webhook has an `X-Hub-Signature-256` 401 test logged.

## 7. If something is wrong

1. Read `/api/health` — DB or Redis red is the usual culprit.
2. Query `ErrorLog` for that window, filter by `component` + `signature`, count,
   open the newest row, get its `traceId`/`release`.
3. Match `release` to a Vercel deployment. Roll back to the previous deployment if the
   breakage arrived with the release.
4. If data is involved → §5 restore path. Cart data re-syncs from Shopify webhooks;
   messages/campaigns are re-creatable by the merchant.
5. For security events follow `docs/incident-response.md` instead.
6. Log-out + incident write-up within 7 days (see incident-response).