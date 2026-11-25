ALTER TABLE "BargainSession" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);

UPDATE "BargainSession" SET "acceptedAt" = "createdAt" WHERE "acceptedAt" IS NULL AND "status" IN ('accepted', 'accepting', 'completed');

CREATE INDEX IF NOT EXISTS "BargainSession_acceptedAt_idx" ON "BargainSession"("acceptedAt");
