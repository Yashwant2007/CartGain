-- 1) Scope the "one credit per Shopify order" constraints to the store.
--
-- Shopify order ids are per-shop sequences. The GLOBAL unique indexes on
-- `RecoveredCart.shopifyOrderId` and `BargainSession.purchasedOrderId` meant
-- store B's order #1001 collided with store A's order #1001: the second
-- store's order was silently dropped as a "duplicate", and a refund arriving
-- for store B netted store A's recovered revenue, Analytics row and revenue
-- share.
--
-- The data is already free of duplicates (the old global unique guaranteed
-- that), so replacing the index with the store-scoped one is a no-op for
-- existing rows.
DROP INDEX IF EXISTS "RecoveredCart_shopifyOrderId_key";
CREATE UNIQUE INDEX "RecoveredCart_storeId_shopifyOrderId_key" ON "RecoveredCart"("storeId", "shopifyOrderId");

DROP INDEX IF EXISTS "BargainSession_purchasedOrderId_key";
CREATE UNIQUE INDEX "BargainSession_storeId_purchasedOrderId_key" ON "BargainSession"("storeId", "purchasedOrderId");

-- 2) Make the recovery send path idempotent.
--
-- `Message` had no uniqueness at all, so a job retry after a successful send
-- (but before the row was written) sent the customer a second copy. The
-- sequence step is recorded on the message and the unique index below makes
-- "one message per cart, channel and step" a database invariant. Legacy rows
-- keep a NULL step, and Postgres allows multiple NULLs in a unique index.
ALTER TABLE "Message" ADD COLUMN "step" INTEGER;
ALTER TABLE "Message" ADD COLUMN "variant" TEXT;
-- Delivery truthfulness: link async provider receipts (WhatsApp wamid, Resend
-- id) back to the message that produced them, and record the prompt version
-- that generated the copy.
ALTER TABLE "Message" ADD COLUMN "providerId" TEXT;
ALTER TABLE "Message" ADD COLUMN "promptVersion" TEXT;
CREATE UNIQUE INDEX "Message_cartId_channel_step_key" ON "Message"("cartId", "channel", "step");
CREATE INDEX "Message_providerId_idx" ON "Message"("providerId");

-- 3) Merchant brand-voice controls.
--
-- One row per store: the voice the AI writes in, the words it must not use,
-- and the local send window.
CREATE TABLE "MerchantVoice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "persona" TEXT NOT NULL DEFAULT 'friendly',
    "emojiIntensity" TEXT NOT NULL DEFAULT 'balanced',
    "humorLevel" TEXT NOT NULL DEFAULT 'light',
    "messageLength" TEXT NOT NULL DEFAULT 'medium',
    "assertiveness" TEXT NOT NULL DEFAULT 'balanced',
    "language" TEXT NOT NULL DEFAULT 'auto',
    "bannedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signOff" TEXT,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantVoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantVoice_storeId_key" ON "MerchantVoice"("storeId");
CREATE INDEX "MerchantVoice_storeId_idx" ON "MerchantVoice"("storeId");

ALTER TABLE "MerchantVoice" ADD CONSTRAINT "MerchantVoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
