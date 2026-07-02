# Supabase RLS Plan

RecoveryFlow is primarily served through Prisma on a trusted server connection. Row Level Security is still valuable as a defense-in-depth control on the Supabase-side API surface.

## Plan
- Enable RLS on exposed `public` tables as a defense-in-depth control.
- Keep the application server on the trusted Prisma connection path.
- Do not rely on browser clients or Supabase publishable keys for direct database access.
- Leave policies deny-by-default unless a specific Supabase API use case is introduced later.
- Because the app currently uses Prisma from trusted server code, no permissive browser-facing RLS policy is added yet.

## Scope for RLS enablement
- `User`
- `Account`
- `Session`
- `VerificationToken`
- `DataAccessLog`
- `Store`
- `Campaign`
- `Cart`
- `Message`
- `RecoveredCart`
- `Analytics`
- `ABTest`
- `Subscription`
- `Invoice`
- `RevenueShareEvent`
- `ApiKey`
- `OptOut`

## Rollout notes
- The tables above remain usable by the server-owned Prisma connection because the database owner bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set.
- If a future Supabase Data API use case is introduced, add explicit policies table-by-table instead of opening the schema broadly.
- After rollout, re-run the Supabase Security Advisor and verify that the public-schema RLS warning is resolved for these tables.
- This is intentionally a staged rollout document, not an immediate public API exposure change.
