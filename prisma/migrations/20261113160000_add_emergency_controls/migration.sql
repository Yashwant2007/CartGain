-- Emergency merchant controls (Module 8)
ALTER TABLE "BargainConfig"
  ADD COLUMN IF NOT EXISTS "emergencyPaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "aiPaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "previousConfigSnapshot" JSONB;
