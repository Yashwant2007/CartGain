# ADR-002 — Database architecture (Prisma, PostgreSQL, merchant-scoped)

## Context
Postgres on Supabase via Prisma 5, `relationMode = "prisma"`. The controller —
`schema.prisma` — has accumulated 20+ migrations including a public-RLS
`enable_public_rls` migration for the storefront-facing tables.

## Decision
- **Merchant isolation by construction**: nearly all dashboard/scoped queries
  gate on `store.findFirst({ id, userId: session.user.id })` (or API-key
  `auth.ctx.userId`). Ownership is enforced in the route/service, not assumed.
- **Indexes from query patterns**: added a dedicated scale migration
  (`20260618075752_add_indexes_for_scale`); hot tables index on
  `(storeId, status)`, `(storeId, cartId)` unique pairs, status-only lookups.
- **Status columns are strings with documented literals**, not Postgres enums —
  chosen deliberately for migration flexibility.
- Shop-facing history uses functional keys (`storeId_shopifyProductId`,
  `BargainSession.status`) so a clean model can be evolved without enum locks.

## Alternatives considered
- Postgres enums — rejected (migrations are painful; string literals are
  documented at each column and enforced by the state machine module).
- Single global `where:{id}` trust — rejected (IDOR risk).

## Consequences
- Any new store-scoped query must reproduce the ownership pattern; this is a
  documented review checklist item for PRs.

## Status
Accepted. Addressed in PR review checklist (see CONTRIBUTING).