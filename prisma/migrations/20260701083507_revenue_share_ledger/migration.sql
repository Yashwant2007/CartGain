-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentLinkUrl" TEXT,
ADD COLUMN     "razorpayOrderId" TEXT,
ADD COLUMN     "razorpayPaymentLinkId" TEXT;

-- AlterTable
ALTER TABLE "RecoveredCart" ADD COLUMN     "shopifyOrderId" TEXT;

-- CreateTable
CREATE TABLE "RevenueShareEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "revSharePercent" DOUBLE PRECISION NOT NULL,
    "revShareAmount" DOUBLE PRECISION NOT NULL,
    "channel" TEXT NOT NULL,
    "attributedMessageId" TEXT,
    "recoveredAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueShareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueShareEvent_cartId_key" ON "RevenueShareEvent"("cartId");

-- CreateIndex
CREATE INDEX "RevenueShareEvent_subscriptionId_idx" ON "RevenueShareEvent"("subscriptionId");

-- CreateIndex
CREATE INDEX "RevenueShareEvent_subscriptionId_invoiceId_idx" ON "RevenueShareEvent"("subscriptionId", "invoiceId");

-- CreateIndex
CREATE INDEX "RevenueShareEvent_storeId_idx" ON "RevenueShareEvent"("storeId");

-- CreateIndex
CREATE INDEX "RevenueShareEvent_invoiceId_idx" ON "RevenueShareEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "Invoice_razorpayOrderId_idx" ON "Invoice"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "Invoice_razorpayPaymentLinkId_idx" ON "Invoice"("razorpayPaymentLinkId");
