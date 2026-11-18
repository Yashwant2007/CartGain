ALTER TABLE "BargainSession"
  ADD COLUMN "checkoutOpenedAt" TIMESTAMP(3),
  ADD COLUMN "checkoutPurchaseAt" TIMESTAMP(3),
  ADD COLUMN "checkoutPurchaseOrderId" TEXT;

CREATE INDEX "BargainSession_checkoutOpenedAt_idx" ON "BargainSession"("checkoutOpenedAt");

CREATE TABLE "BargainPurchaseMemory" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "shopifyOrderId" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "cartToken" TEXT,
  "customerId" TEXT,
  "shopifyProductId" TEXT,
  "variantId" TEXT,
  "productTitle" TEXT,
  "price" DOUBLE PRECISION,
  "currency" TEXT,
  "purchasedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BargainPurchaseMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BargainPurchaseMemory_order_key" ON "BargainPurchaseMemory"("storeId", "shopifyOrderId", "shopifyProductId");
CREATE INDEX "BargainPurchaseMemory_email_date_idx" ON "BargainPurchaseMemory"("storeId", "customerEmail", "purchasedAt");
CREATE INDEX "BargainPurchaseMemory_cart_date_idx" ON "BargainPurchaseMemory"("storeId", "cartToken", "purchasedAt");
CREATE INDEX "BargainPurchaseMemory_customer_date_idx" ON "BargainPurchaseMemory"("storeId", "customerId", "purchasedAt");
CREATE INDEX "BargainPurchaseMemory_store_date_idx" ON "BargainPurchaseMemory"("storeId", "purchasedAt");

ALTER TABLE "BargainPurchaseMemory"
  ADD CONSTRAINT "BargainPurchaseMemory_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
