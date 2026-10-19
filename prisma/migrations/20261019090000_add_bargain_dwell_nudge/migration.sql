-- Storefront engagement: product-page dwell nudge settings on BargainConfig.
-- The theme controller (storefront-bargain bargain.js) polls the public
-- GET /api/bargain/dwell-config endpoint (shop-domain keyed) to decide whether
-- to softly nudge a shopper who lingers on a product page, and after how long.
-- Defaults mirror the product spec: OPT-IN (off until the merchant enables it
-- in Bargain settings), 60s to the first nudge, 60s to the reminder.
-- Non-destructive: adds NOT-NULL columns with server defaults, so existing rows
-- are backfilled by the default and nothing is dropped.
ALTER TABLE "BargainConfig" ADD COLUMN "dwellNudgeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BargainConfig" ADD COLUMN "dwellSeconds" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "BargainConfig" ADD COLUMN "dwellReminderSeconds" INTEGER NOT NULL DEFAULT 60;
