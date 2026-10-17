-- Per-store webhook signing secret (encrypted at rest).
-- Null means "use the app-wide SHOPIFY_API_SECRET" (the normal case for a
-- public Shopify app). When set, the Shopify webhook route verifies the HMAC
-- against this store's own secret, binding deliveries to the shop.
ALTER TABLE "Store" ADD COLUMN "webhookSecret" TEXT;
