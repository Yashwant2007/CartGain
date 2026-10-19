-- Make the product-page dwell nudge opt-in.
--
-- The original nudge migration (20261019090000) added the column with a
-- DEFAULT of true, so every existing BargainConfig row was backfilled to ON.
-- The product decision is opt-in, so lower the column default to false and
-- reset the rows that were auto-backfilled — the setting is brand new, so no
-- merchant had a chance to deliberately enable it.
ALTER TABLE "BargainConfig" ALTER COLUMN "dwellNudgeEnabled" SET DEFAULT false;
UPDATE "BargainConfig" SET "dwellNudgeEnabled" = false WHERE "dwellNudgeEnabled" = true;
