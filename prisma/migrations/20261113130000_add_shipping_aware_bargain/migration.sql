-- Module 4 — shipping-aware negotiation. Additive, nullable / defaulted columns
-- on BargainConfig so every existing store keeps its current behaviour
-- (shippingAwareEnabled defaults false). No data backfill required.

ALTER TABLE "BargainConfig"
  ADD COLUMN "shippingAwareEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shippingFlatCost" DOUBLE PRECISION,
  ADD COLUMN "freeShippingThreshold" DOUBLE PRECISION;
