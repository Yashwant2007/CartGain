-- AlterTable
ALTER TABLE "BargainConfig" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'auto';

-- AlterTable
ALTER TABLE "BargainSession" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'auto';