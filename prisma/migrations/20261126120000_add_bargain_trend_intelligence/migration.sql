ALTER TABLE "BargainConfig" ADD COLUMN "trendIntelligenceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BargainConfig" ADD COLUMN "trendRegion" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "BargainConfig" ADD COLUMN "trendTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BargainConfig" ADD COLUMN "trendExcludedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BargainConfig" ADD COLUMN "trendHumorEnabled" BOOLEAN NOT NULL DEFAULT false;
