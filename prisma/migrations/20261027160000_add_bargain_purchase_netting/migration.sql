-- Bargain purchase refund netting. Additive only. Backfill gross value from the
-- existing recognized value so historical attributed purchases stay intact.
ALTER TABLE "BargainSession"
  ADD COLUMN "purchaseGrossValue" DOUBLE PRECISION,
  ADD COLUMN "purchaseRefundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "purchaseRefundStatus" TEXT,
  ADD COLUMN "purchaseRefundEventIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "BargainSession"
SET "purchaseGrossValue" = "purchaseValue"
WHERE "purchasedAt" IS NOT NULL AND "purchaseGrossValue" IS NULL;
