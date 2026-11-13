-- Bundle / multi-item negotiation (Module 6)
ALTER TABLE "BargainConfig"
  ADD COLUMN IF NOT EXISTS "bundleNegotiationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bundleDiscountPercent" DOUBLE PRECISION;
