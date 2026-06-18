-- DropForeignKey
ALTER TABLE "ABTest" DROP CONSTRAINT "ABTest_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Analytics" DROP CONSTRAINT "Analytics_userId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_userId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_cartId_fkey";

-- DropForeignKey
ALTER TABLE "RecoveredCart" DROP CONSTRAINT "RecoveredCart_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RecoveredCart" DROP CONSTRAINT "fk_cart";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "Store" DROP CONSTRAINT "Store_userId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- CreateIndex
CREATE INDEX "ABTest_campaignId_idx" ON "ABTest"("campaignId");

-- CreateIndex
CREATE INDEX "Analytics_userId_idx" ON "Analytics"("userId");

-- CreateIndex
CREATE INDEX "Campaign_storeId_idx" ON "Campaign"("storeId");

-- CreateIndex
CREATE INDEX "Campaign_storeId_isActive_idx" ON "Campaign"("storeId", "isActive");

-- CreateIndex
CREATE INDEX "Cart_storeId_idx" ON "Cart"("storeId");

-- CreateIndex
CREATE INDEX "Cart_storeId_isRecovered_abandonedAt_idx" ON "Cart"("storeId", "isRecovered", "abandonedAt");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Message_cartId_idx" ON "Message"("cartId");

-- CreateIndex
CREATE INDEX "Message_campaignId_idx" ON "Message"("campaignId");

-- CreateIndex
CREATE INDEX "RecoveredCart_storeId_idx" ON "RecoveredCart"("storeId");

-- CreateIndex
CREATE INDEX "Store_userId_idx" ON "Store"("userId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
