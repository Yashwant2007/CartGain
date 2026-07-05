-- DropForeignKey
ALTER TABLE "CodNudge" DROP CONSTRAINT "CodNudge_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_storeId_fkey";

-- DropForeignKey
ALTER TABLE "MerchantConfig" DROP CONSTRAINT "MerchantConfig_storeId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRecoveryCampaign" DROP CONSTRAINT "PaymentRecoveryCampaign_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "PincodeStats" DROP CONSTRAINT "PincodeStats_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RtoRiskScore" DROP CONSTRAINT "RtoRiskScore_storeId_fkey";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "intentScore" DOUBLE PRECISION,
ADD COLUMN     "intentType" TEXT,
ADD COLUMN     "intentUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerInsight" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "intentType" TEXT NOT NULL,
    "intentScore" DOUBLE PRECISION NOT NULL,
    "lifetimeValue" DOUBLE PRECISION,
    "avgOrderValue" DOUBLE PRECISION,
    "totalAbandons" INTEGER NOT NULL DEFAULT 0,
    "totalRecoveries" INTEGER NOT NULL DEFAULT 0,
    "preferences" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT,
    "metrics" JSONB,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isActioned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "insights" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartPrediction" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "probabilityScore" DOUBLE PRECISION NOT NULL,
    "predictedValue" DOUBLE PRECISION,
    "intentType" TEXT,
    "discountSuggestion" JSONB,
    "bestChannel" TEXT,
    "features" JSONB,
    "modelVersion" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerInsight_storeId_idx" ON "CustomerInsight"("storeId");

-- CreateIndex
CREATE INDEX "CustomerInsight_storeId_intentType_idx" ON "CustomerInsight"("storeId", "intentType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInsight_storeId_customerId_key" ON "CustomerInsight"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "AiSuggestion_storeId_createdAt_idx" ON "AiSuggestion"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_userId_createdAt_idx" ON "AiSuggestion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiReport_storeId_periodStart_periodEnd_idx" ON "AiReport"("storeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "AiReport_userId_createdAt_idx" ON "AiReport"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartPrediction_cartId_key" ON "CartPrediction"("cartId");

-- CreateIndex
CREATE INDEX "CartPrediction_storeId_idx" ON "CartPrediction"("storeId");

-- CreateIndex
CREATE INDEX "CartPrediction_storeId_probabilityScore_idx" ON "CartPrediction"("storeId", "probabilityScore");
