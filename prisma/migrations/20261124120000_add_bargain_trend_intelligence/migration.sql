ALTER TABLE "BargainConfig"
  ADD COLUMN "trendIntelligenceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trendRegion" TEXT,
  ADD COLUMN "trendTopics" TEXT[] DEFAULT '{}',
  ADD COLUMN "trendExcludedTopics" TEXT[] DEFAULT '{}',
  ADD COLUMN "trendHumorEnabled" BOOLEAN NOT NULL DEFAULT false;
