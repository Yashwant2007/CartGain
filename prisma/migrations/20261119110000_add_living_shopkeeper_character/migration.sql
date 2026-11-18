-- Living Shopkeeper Engine: merchant-selectable character visual style and an
-- "essential motion only" switch that keeps state-changing animation while
-- disabling decorative idle loops. Additive and backwards compatible: every
-- existing store keeps the full animated character until a merchant changes
-- the setting.

ALTER TABLE "BargainConfig"
ADD COLUMN IF NOT EXISTS "characterStyle" TEXT NOT NULL DEFAULT 'signature',
ADD COLUMN IF NOT EXISTS "essentialMotionOnly" BOOLEAN NOT NULL DEFAULT false;
