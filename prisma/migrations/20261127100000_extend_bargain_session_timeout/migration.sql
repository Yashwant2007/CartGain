ALTER TABLE "BargainConfig" ALTER COLUMN "sessionTimeout" SET DEFAULT 86400;

UPDATE "BargainConfig" SET "sessionTimeout" = 86400 WHERE "sessionTimeout" = 300;
