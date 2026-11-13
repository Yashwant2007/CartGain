-- Dual-agent experiment arm (Module 7)
ALTER TABLE "BargainSession"
  ADD COLUMN IF NOT EXISTS "experimentArm" TEXT;
