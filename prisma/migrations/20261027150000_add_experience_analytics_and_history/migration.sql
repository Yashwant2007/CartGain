-- Storefront experience analytics + publish history. Additive only.
ALTER TABLE "BargainSession"
  ADD COLUMN "experienceDesign" TEXT,
  ADD COLUMN "experiencePersonality" TEXT,
  ADD COLUMN "experienceVersion" INTEGER,
  ADD COLUMN "experienceVisitorKey" TEXT;

CREATE TABLE "BargainExperienceEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sessionId" TEXT,
  "visitorKey" TEXT,
  "eventType" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "designVariant" TEXT,
  "personality" TEXT,
  "productId" TEXT,
  "variantId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'storefront',
  "isPreview" BOOLEAN NOT NULL DEFAULT false,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "BargainExperienceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BargainExperienceEvent_eventId_key" ON "BargainExperienceEvent"("eventId");
CREATE INDEX "BargainExperienceEvent_storeId_eventType_occurredAt_idx" ON "BargainExperienceEvent"("storeId", "eventType", "occurredAt");
CREATE INDEX "BargainExperienceEvent_storeId_designVariant_occurredAt_idx" ON "BargainExperienceEvent"("storeId", "designVariant", "occurredAt");
CREATE INDEX "BargainExperienceEvent_storeId_personality_occurredAt_idx" ON "BargainExperienceEvent"("storeId", "personality", "occurredAt");
CREATE INDEX "BargainExperienceEvent_storeId_visitorKey_occurredAt_idx" ON "BargainExperienceEvent"("storeId", "visitorKey", "occurredAt");
CREATE INDEX "BargainExperienceEvent_sessionId_idx" ON "BargainExperienceEvent"("sessionId");

CREATE TABLE "BargainExperiencePublish" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'publish',
  "config" JSONB NOT NULL,
  "publishedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BargainExperiencePublish_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BargainExperiencePublish_storeId_version_key" ON "BargainExperiencePublish"("storeId", "version");
CREATE INDEX "BargainExperiencePublish_storeId_createdAt_idx" ON "BargainExperiencePublish"("storeId", "createdAt");
