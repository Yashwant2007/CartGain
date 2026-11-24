CREATE TABLE IF NOT EXISTS "BargainBundleQuote" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cartToken" TEXT,
    "token" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "listTotal" DOUBLE PRECISION NOT NULL,
    "floorTotal" DOUBLE PRECISION NOT NULL,
    "offerTotal" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "discountCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainBundleQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BargainBundleQuote_token_key" ON "BargainBundleQuote"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "BargainBundleQuote_storeId_discountCode_key" ON "BargainBundleQuote"("storeId", "discountCode");
CREATE INDEX IF NOT EXISTS "BargainBundleQuote_storeId_idx" ON "BargainBundleQuote"("storeId");
CREATE INDEX IF NOT EXISTS "BargainBundleQuote_sessionId_idx" ON "BargainBundleQuote"("sessionId");
CREATE INDEX IF NOT EXISTS "BargainBundleQuote_cartToken_idx" ON "BargainBundleQuote"("cartToken");
CREATE INDEX IF NOT EXISTS "BargainBundleQuote_expiresAt_idx" ON "BargainBundleQuote"("expiresAt");
