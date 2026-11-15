-- Accepted-deal follow-up (Phase 5)
ALTER TABLE "BargainConfig"
  ADD COLUMN IF NOT EXISTS "dealFollowupEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dealFollowupDelaysMinutes" JSONB,
  ADD COLUMN IF NOT EXISTS "dealFollowupMax" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS "BargainDealFollowup" (
  "id"         TEXT NOT NULL,
  "storeId"    TEXT NOT NULL,
  "sessionId"  TEXT NOT NULL,
  "stage"      INTEGER NOT NULL,
  "channel"    TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'sent',
  "providerId" TEXT,
  "detail"     JSONB NOT NULL DEFAULT '{}',
  "sentAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BargainDealFollowup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BargainDealFollowup_sessionId_stage_channel_key"
  ON "BargainDealFollowup" ("sessionId", "stage", "channel");
CREATE INDEX IF NOT EXISTS "BargainDealFollowup_storeId_idx" ON "BargainDealFollowup" ("storeId");
CREATE INDEX IF NOT EXISTS "BargainDealFollowup_sessionId_idx" ON "BargainDealFollowup" ("sessionId");
CREATE INDEX IF NOT EXISTS "BargainDealFollowup_sentAt_idx" ON "BargainDealFollowup" ("sentAt");
