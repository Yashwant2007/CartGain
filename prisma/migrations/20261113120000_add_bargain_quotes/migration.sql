-- Module 3 — first-party secure bargain quotes.
-- Purely additive: two new tables. Existing sessions, discount codes and the
-- accept/checkout paths are untouched when the BARGAIN_QUOTE flag is off, and
-- the quote layer only ever writes new rows. No column is added to or removed
-- from an existing table, so this migration is safe to deploy ahead of code.

CREATE TABLE "BargainQuote" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "cartToken" TEXT,
    "shopifyProductId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "floorPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "customerEmail" TEXT,
    "shopifyCustomerId" TEXT,
    "customerFingerprint" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "discountCode" TEXT,
    "orderId" TEXT,
    "revokeReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "checkoutStartedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BargainQuoteEvent" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BargainQuoteEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BargainQuote_token_key" ON "BargainQuote"("token");
CREATE INDEX "BargainQuote_storeId_idx" ON "BargainQuote"("storeId");
CREATE INDEX "BargainQuote_storeId_status_idx" ON "BargainQuote"("storeId", "status");
CREATE INDEX "BargainQuote_sessionId_idx" ON "BargainQuote"("sessionId");
CREATE INDEX "BargainQuote_discountCode_idx" ON "BargainQuote"("discountCode");
CREATE INDEX "BargainQuote_cartToken_idx" ON "BargainQuote"("cartToken");
CREATE INDEX "BargainQuote_expiresAt_idx" ON "BargainQuote"("expiresAt");

CREATE INDEX "BargainQuoteEvent_quoteId_idx" ON "BargainQuoteEvent"("quoteId");
CREATE INDEX "BargainQuoteEvent_storeId_idx" ON "BargainQuoteEvent"("storeId");
