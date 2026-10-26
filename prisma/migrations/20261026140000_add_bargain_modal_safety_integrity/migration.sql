-- AlterTable
ALTER TABLE "BargainConfig" ADD COLUMN     "abuseStrictness" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "negotiationStyle" TEXT;

-- AlterTable
ALTER TABLE "BargainSession" ADD COLUMN     "learningQuarantined" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BargainLearningOutcome" ADD COLUMN     "quarantined" BOOLEAN NOT NULL DEFAULT false;
