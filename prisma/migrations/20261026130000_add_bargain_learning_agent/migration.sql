-- AlterTable
ALTER TABLE "BargainSession" ADD COLUMN     "environment" TEXT NOT NULL DEFAULT 'production',
ADD COLUMN     "learningContextKey" TEXT,
ADD COLUMN     "learningMaxRounds" INTEGER,
ADD COLUMN     "learningMode" TEXT,
ADD COLUMN     "learningShadowStrategy" TEXT,
ADD COLUMN     "learningStrategy" TEXT,
ADD COLUMN     "learningStrategyVersion" TEXT;

-- CreateTable
CREATE TABLE "BargainLearningConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "shadowMode" BOOLEAN NOT NULL DEFAULT true,
    "demoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "explorationRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "minSamplesPerArm" INTEGER NOT NULL DEFAULT 30,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 7,
    "eventRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "rewardConversion" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "rewardMargin" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "rewardExperience" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "rewardEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "allowedStrategies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedStrategies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promoStrategyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastFinalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainLearningConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainLearningEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "eventType" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "baselineStrategy" TEXT,
    "strategyVersion" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "intent" TEXT,
    "objection" TEXT,
    "offerBucket" TEXT,
    "budgetBucket" TEXT,
    "recommendationEligible" BOOLEAN NOT NULL DEFAULT false,
    "value" DOUBLE PRECISION,
    "dedupeKey" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BargainLearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainLearningOutcome" (
    "id" TEXT NOT NULL,
    "outcomeKey" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "strategy" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION,
    "floorPrice" DOUBLE PRECISION,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "purchaseValue" DOUBLE PRECISION,
    "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shopifyOrderId" TEXT,
    "reward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardExperience" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptedAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "lastRewardAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainLearningOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainLearningArmStat" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "pulls" INTEGER NOT NULL DEFAULT 0,
    "outcomes" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "purchased" INTEGER NOT NULL DEFAULT 0,
    "rewardSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardSqSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "beta" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastRewardAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainLearningArmStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainLearningAudit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BargainLearningAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BargainLearningConfig_storeId_key" ON "BargainLearningConfig"("storeId");

-- CreateIndex
CREATE INDEX "BargainLearningConfig_storeId_idx" ON "BargainLearningConfig"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "BargainLearningEvent_dedupeKey_key" ON "BargainLearningEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "BargainLearningEvent_storeId_environment_createdAt_idx" ON "BargainLearningEvent"("storeId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "BargainLearningEvent_storeId_strategy_createdAt_idx" ON "BargainLearningEvent"("storeId", "strategy", "createdAt");

-- CreateIndex
CREATE INDEX "BargainLearningEvent_sessionId_idx" ON "BargainLearningEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BargainLearningOutcome_outcomeKey_key" ON "BargainLearningOutcome"("outcomeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BargainLearningOutcome_sessionId_key" ON "BargainLearningOutcome"("sessionId");

-- CreateIndex
CREATE INDEX "BargainLearningOutcome_storeId_environment_createdAt_idx" ON "BargainLearningOutcome"("storeId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "BargainLearningOutcome_storeId_strategy_createdAt_idx" ON "BargainLearningOutcome"("storeId", "strategy", "createdAt");

-- CreateIndex
CREATE INDEX "BargainLearningOutcome_sessionId_idx" ON "BargainLearningOutcome"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BargainLearningOutcome_storeId_shopifyOrderId_key" ON "BargainLearningOutcome"("storeId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "BargainLearningArmStat_storeId_environment_contextKey_idx" ON "BargainLearningArmStat"("storeId", "environment", "contextKey");

-- CreateIndex
CREATE UNIQUE INDEX "BargainLearningArmStat_key" ON "BargainLearningArmStat"("storeId", "environment", "strategyVersion", "contextKey", "strategy");

-- CreateIndex
CREATE INDEX "BargainLearningAudit_storeId_createdAt_idx" ON "BargainLearningAudit"("storeId", "createdAt");

