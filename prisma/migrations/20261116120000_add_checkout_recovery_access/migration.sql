-- Shopify AbandonedCheckout.abandonedCheckoutUrl moves behind Level 2
-- protected customer data access on 2026-11-23. These columns let CartGain
-- record URL availability independently of checkout/recovery state, cache the
-- store's capability, and persist the sensitive recovery URL only encrypted.
ALTER TABLE "Store"
  ADD COLUMN "abandonedCheckoutUrlAccess" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "abandonedCheckoutUrlCheckedAt" TIMESTAMP(3);

ALTER TABLE "Cart"
  ADD COLUMN "recoveryUrlStatus" TEXT,
  ADD COLUMN "recoveryUrlEncrypted" TEXT,
  ADD COLUMN "recoveryUrlCheckedAt" TIMESTAMP(3);
