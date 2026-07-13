-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cartsLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cartsUsedInPeriod" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Message_campaignId_sentAt_idx" ON "Message"("campaignId", "sentAt");

-- CreateIndex
CREATE INDEX "Store_domain_idx" ON "Store"("domain");
