-- AI agent attribution. Additive only: existing sessions/events/outcomes stay
-- unattributed instead of being guessed. No raw prompts or customer text.
ALTER TABLE "BargainSession"
  ADD COLUMN "lastAiSource" TEXT,
  ADD COLUMN "lastAiModel" TEXT,
  ADD COLUMN "lastAiFailure" TEXT;

ALTER TABLE "BargainLearningEvent"
  ADD COLUMN "agentSource" TEXT,
  ADD COLUMN "agentModel" TEXT,
  ADD COLUMN "latencyMs" INTEGER,
  ADD COLUMN "failureCategory" TEXT;

ALTER TABLE "BargainLearningOutcome"
  ADD COLUMN "agentSource" TEXT,
  ADD COLUMN "agentModel" TEXT;

CREATE INDEX "BargainLearningEvent_storeId_agentSource_createdAt_idx"
  ON "BargainLearningEvent"("storeId", "agentSource", "createdAt");

CREATE INDEX "BargainLearningOutcome_storeId_agentSource_createdAt_idx"
  ON "BargainLearningOutcome"("storeId", "agentSource", "createdAt");
