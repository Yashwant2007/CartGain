-- CartGain production hardening: enforce one Subscription row per user.
-- Previously the schema allowed multiple rows per userId; a check-then-create
-- race in createFreeSubscription and the `upsert({ where: { id: 'none' } })`
-- fallback in create-subscription could manufacture duplicates, leaving
-- every findFirst({ where: { userId } }) plan lookup non-deterministic.

-- 1. De-duplicate existing rows before adding the unique constraint. Keep the
--    most recently created row per user (tie-broken by newest id) and drop
--    older duplicates. Latest row is the one matching the user's active state.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "userId"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS rn
  FROM "Subscription"
)
DELETE FROM "Subscription"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Backward-compatible unique constraint (matches Prisma's @@unique([userId])).
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- 3. Index the Razorpay subscription id — the payment webhook resolves subs by
--    subscriptionId on every activated/paused/cancelled event.
CREATE INDEX "Subscription_subscriptionId_idx" ON "Subscription"("subscriptionId");