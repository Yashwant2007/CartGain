-- CreateTable
CREATE TABLE "BargainConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "aiPersona" TEXT NOT NULL DEFAULT 'friendly_shopkeeper',
    "minProfitPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "sessionTimeout" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "variantId" TEXT,
    "productTitle" TEXT,
    "minPrice" DOUBLE PRECISION,
    "minProfitPercent" DOUBLE PRECISION,
    "maxDiscountPercent" INTEGER,
    "isBargainable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cartToken" TEXT,
    "shopifyProductId" TEXT NOT NULL,
    "variantId" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "currentOffer" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION,
    "discountCode" TEXT,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BargainSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "offeredPrice" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BargainMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BargainConfig_storeId_key" ON "BargainConfig"("storeId");

-- CreateIndex
CREATE INDEX "BargainConfig_storeId_idx" ON "BargainConfig"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "BargainProduct_storeId_shopifyProductId_key" ON "BargainProduct"("storeId", "shopifyProductId");

-- CreateIndex
CREATE INDEX "BargainProduct_storeId_idx" ON "BargainProduct"("storeId");

-- CreateIndex
CREATE INDEX "BargainSession_storeId_idx" ON "BargainSession"("storeId");

-- CreateIndex
CREATE INDEX "BargainSession_storeId_status_idx" ON "BargainSession"("storeId", "status");

-- CreateIndex
CREATE INDEX "BargainSession_cartToken_idx" ON "BargainSession"("cartToken");

-- CreateIndex
CREATE INDEX "BargainSession_customerEmail_idx" ON "BargainSession"("customerEmail");

-- CreateIndex
CREATE INDEX "BargainSession_status_idx" ON "BargainSession"("status");

-- CreateIndex
CREATE INDEX "BargainSession_expiredAt_idx" ON "BargainSession"("expiredAt");

-- CreateIndex
CREATE INDEX "BargainMessage_sessionId_idx" ON "BargainMessage"("sessionId");

-- CreateIndex
CREATE INDEX "BargainMessage_createdAt_idx" ON "BargainMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "BargainConfig" ADD CONSTRAINT "BargainConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BargainProduct" ADD CONSTRAINT "BargainProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BargainSession" ADD CONSTRAINT "BargainSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BargainMessage" ADD CONSTRAINT "BargainMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BargainSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
