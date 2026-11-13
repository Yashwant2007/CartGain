-- Module 5 — payment-method-aware negotiation. Additive, defaulted / nullable
-- columns on BargainConfig so existing stores keep their current behaviour
-- (paymentAwareEnabled defaults false). No data backfill required.

ALTER TABLE "BargainConfig"
  ADD COLUMN "paymentAwareEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "prepaidIncentivePercent" DOUBLE PRECISION;
