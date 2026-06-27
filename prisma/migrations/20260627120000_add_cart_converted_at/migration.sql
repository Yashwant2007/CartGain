-- AlterTable: separate "purchased" (stop messaging) from "recovered by us" (credit/billing)
ALTER TABLE "Cart" ADD COLUMN "convertedAt" TIMESTAMP(3);

-- CreateIndex: support the processor's "abandoned, not converted, not recovered" scan
CREATE INDEX "Cart_storeId_convertedAt_abandonedAt_idx" ON "Cart"("storeId", "convertedAt", "abandonedAt");
