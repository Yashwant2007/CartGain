# CartGain 🚀

**Cart recovery + AI bargain engine for Shopify merchants.** Recover abandoned
carts and win more of them with a storefront bargaining widget that negotiates
with shoppers in real time — safely, within merchant-set price floors.

> Formerly branded "RecoverFlow". This repository is CartGain.

## What it does

- **Abandoned cart recovery** — email/WhatsApp rescue sequences with secure
  redirect links (click tracking, COD confirm, payment resume).
- **AI Bargain widget** — an embeddable Shopify storefront assistant that greets
  shoppers, negotiates offers and locks deals as Shopify discount codes. The
  negotiation runs inside a **deterministic financial-safety layer**: the AI
  crafts the wording; the floor price, discount depth and campaign rules are
  enforced server-side in integer minor units and can never be breached.
- **Personas & goals** — merchant-chosen sales personalities
  (friendly/strict/playful) and per-day deal goals with revenue-share
  attribution.
- **RTO & payment recovery** — COD→prepaid nudges, RTO risk scoring, payment
  retry campaigns.
- **Analytics** — recovered revenue, ROI, campaign A/B tests, bargain KPIs.
- **Billing** — Razorpay subscriptions and Shopify Billing (app subscription)
  with invoices and a revenue-share ledger.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Backend | Next.js Route Handlers, Prisma ORM |
| Database | PostgreSQL (Supabase) |
| Queue | Bull + ioredis (in-process on Vercel serverless) |
| Auth | NextAuth.js v4 (credentials, 2FA/TOTP) |
| Payments | Razorpay (primary) + Cashfree (secondary), Shopify Billing |
| WhatsApp | Meta Graph API (webhook, HMAC-verified) |
| Email | Resend |
| AI | OpenAI (primary) + OpenAI-compatible fallback (Groq) |
| Hosting | Vercel (`cart-gain.com`) |

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your credentials
npx prisma generate
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000

Required env: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
`ENCRYPTION_KEY`, `RESEND_API_KEY`, Razorpay keys. See `.env.example` for the
full list. Validate any missing variable with:
`npm run typecheck` and the `/api/health` endpoint (renders missing vars).

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (unit + integration, 640+ tests) |
| `npm run vercel-build` | Vercel production build |

## Project structure

```
src/
├── app/
│   ├── api/            # Route handlers (auth, bargain, shopify, payments, jobs, …)
│   ├── dashboard/      # Merchant dashboard
│   ├── bargain/        # Storefront embed + host page
│   ├── demo/ s/ r/     # Demo surfaces & recovery redirects
│   └── marketing/      # Pricing, terms, privacy, docs…
├── components/         # UI primitives + domain surfaces (bargain widget, charts…)
├── lib/
│   ├── bargain/        # Bargain engine: safety, policy, abuse, intent, state machine
│   ├── payments/       # Gateway adapters (razorpay/cashfree) + recovery
│   ├── shopify*.ts     # Shopify OAuth, GraphQL, webhooks
│   ├── services/       # AI, email, WhatsApp orchestration
│   ├── jobs/, queue/   # Bull jobs + processors
│   ├── observability/  # Structured logs, redaction
│   └── …               # env, validation, rate-limit, financial-safety…
└── middleware.ts       # Auth gate + x-request-id trace corridor
extensions/             # Shopify UI extensions
docs/                   # architecture, decisions (ADRs), security, operations
```

## Bargain safety model (important)

The negotiator is layered. The AI is never the final authority on money:

```
Customer → Bargain API → Session state → Product context
  → Deterministic policy (floor / attempts / campaign / coupons / stock)
  → AI negotiator (wording only)
  → validateOffer() + buildExecutablePrice()  ← hard, server-side
  → Response
```

- The merchant floor is computed server-side, byte-for-byte guarded in integer
  minor units, and **never sent to the client or to the AI prompt**.
- Session lifecycle is a deterministic state machine
  (`active → accepting → accepted | rejected | expired | abandoned`); invalid
  transitions are impossible by construction.
- Casual "I quit" wording triggers a **retention** path, never a termination;
  only a second walk-out or an exhausted attempt budget closes a session.

See `docs/architecture/` and `docs/decisions/` for the deep dive.

## Documentation

- `docs/architecture/` — audit + final architecture
- `docs/decisions/` — architecture decision records (ADRs)
- `docs/security/` — security & staff access policies
- `docs/observability.md`, `docs/incident-response.md`, `docs/operations`
- `CONTRIBUTING.md` — developer onboarding

## License

MIT