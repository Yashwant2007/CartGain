# Contributing to CartGain

## Setup

1. `npm install`
2. `cp .env.example .env.local` and fill in credentials (see below).
3. `npx prisma generate` — build the Prisma client.
4. `npx prisma migrate dev` — apply migrations against a local PostgreSQL.
5. `npm run dev` — http://localhost:3000.

`.env.local` is gitignored. Never commit real secrets; the CI job fails if a
`.env*` or `credentials/` file is ever tracked.

### Minimum env to boot the dev server

`DATABASE_URL`, `DIRECT_URL` (if used), `NEXTAUTH_URL=http://localhost:3000`,
`NEXTAUTH_SECRET`, `ENCRYPTION_KEY`. Most subsystems (AI, WhatsApp, Razorpay)
degrade gracefully when their vars are missing — `/api/health` reports exactly
which ones are absent.

## Database

- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.
- After editing the schema: `npx prisma migrate dev --name <change>`,
  then `npx prisma generate`.
- `relationMode = "prisma"` is set — foreign keys exist but postgres-level FKs
  are not relied on inside Prisma.

## Validation gates (must pass before commit)

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Jest (~640 tests)
npm run build        # prisma generate && next build
```

The CI workflow (`.github/workflows/ci.yml`) runs the first four plus a
"no tracked secrets" check on every push/PR.

## Testing conventions

- Jest + ts-jest; tests live next to the code in `__tests__/` folders.
- Branch of critical business rules (bargain floor, offer validation, session
  state machine, security, financial-safety) has mandatory test coverage.
- When changing bargain behavior, extend the relevant suite under
  `src/lib/bargain/__tests__/`.

## Local Shopify development

- `shopify.app.toml` is the app config; `npx shopify app dev` tunnels the
  extension locally.
- Shopify webhooks verify HMAC (`verifyShopifyWebhook`) — run them against
  ngrok/npm-tunnel URLs during local dev and set the matching secret.

## Queues & jobs

- Bull jobs live in `src/lib/jobs/`, wired in `src/lib/queue/`.
- Every job endpoint is authenticated (`job-auth.ts`) and de-duplicated
  (`job-lock.ts`) — keep it that way.
- Jobs are idempotent by contract; on failure they capture a structured error
  via `@/lib/observability/logger` and (for high-severity) alert.

## Webhooks

- Signatures are the identity: Shopify gets HMAC verification, Razorpay gets
  gateway signature checks, WhatsApp uses `X-Hub-Signature-256`.
- Handlers acknowledge fast, de-duplicate deliveries (Redis NX keys), then
  process async. Respect this pattern for new webhook topics.

## Error & logging conventions

- Respond with the typed envelope from `src/lib/api-error.ts`
  (`{ success, error:{ code, message }, requestId }`); wire `requestId` from the
  `x-request-id` header the middleware sets.
- Log through `@/lib/observability/logger` (`captureError` / `logWarn` /
  `logInfo`), which redacts secrets and PII. Avoid gut-level `console.*` in new
  code.

## Common debugging

- A request hanging? Check `/api/health` for DB/Redis/AI status.
- Libs misbehaving only on the storefront? The widget runs inside a Shopify
  iframe — reproduce with a local `/bargain/embed?…` URL and clear cached theme
  assets before re-measuring layout.

## Deployment

- Vercel: `npx vercel deploy --prod --yes` (aliases to cart-gain.com).
- Shopify assets: `npx shopify app deploy` (see `shopify.app.toml`).