-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "shopifyRefreshToken" TEXT,
ADD COLUMN     "shopifyTokenExpiresAt" TIMESTAMP(3);
