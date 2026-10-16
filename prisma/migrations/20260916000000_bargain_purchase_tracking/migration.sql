-- Post-bargain purchase window + purchase attribution.
-- Additive only: existing accepted sessions keep working (new columns default
-- to NULL/0). `claimToken` is the opaque handle for the buyer's purchase-window
-- link; `purchasedOrderId` is unique so a Shopify order can credit at most one
-- bargain session (same idempotency pattern as RecoveredCart.shopifyOrderId).

ALTER TABLE "BargainSession"
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "purchaseUrl" TEXT,
  ADD COLUMN "purchasedAt" TIMESTAMP(3),
  ADD COLUMN "purchasedOrderId" TEXT,
  ADD COLUMN "purchaseValue" DOUBLE PRECISION;

-- Postgres allows many NULLs in a unique index, so un-minted / unpurchased
-- sessions never collide.
CREATE UNIQUE INDEX "BargainSession_claimToken_key" ON "BargainSession"("claimToken");
CREATE UNIQUE INDEX "BargainSession_purchasedOrderId_key" ON "BargainSession"("purchasedOrderId");

-- Bargain outcomes tracked separately from cart-recovery counters.
ALTER TABLE "Analytics"
  ADD COLUMN "bargainPurchases" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bargainRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Link a booked bargain revenue-share event to the confirming order so the
-- purchase can be reconciled (and refunded) later. Both nullable for events
-- booked at accept time before an order exists.
ALTER TABLE "BargainRevenueShareEvent"
  ADD COLUMN "shopifyOrderId" TEXT,
  ADD COLUMN "purchasedAt" TIMESTAMP(3);
