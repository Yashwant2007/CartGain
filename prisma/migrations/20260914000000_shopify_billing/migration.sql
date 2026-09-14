-- CartGain App Store billing: additive Shopify Billing columns on Subscription.
-- Existing rows default to the legacy Razorpay/direct track, so behaviour for
-- every current merchant is unchanged. Shopify Billing normalizes into the same
-- Subscription row, so all existing plan gating keeps reading `plan` + `status`.

ALTER TABLE "Subscription"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'razorpay',
  ADD COLUMN "shopDomain" TEXT,
  ADD COLUMN "shopifySubscriptionId" TEXT,
  ADD COLUMN "shopifyLineItemId" TEXT;

-- One Shopify AppSubscription can only ever map to one CartGain subscription.
-- (Postgres allows many NULLs in a unique index, so non-Shopify rows are fine.)
CREATE UNIQUE INDEX "Subscription_shopifySubscriptionId_key"
  ON "Subscription"("shopifySubscriptionId");

-- The app_subscriptions/update webhook resolves the local row by shop domain.
CREATE INDEX "Subscription_shopDomain_idx" ON "Subscription"("shopDomain");
