-- AI Salesperson: merchant-approved Q&A facts the bargain agent may answer truthfully.
ALTER TABLE "BargainConfig" ADD COLUMN IF NOT EXISTS "merchantFaq" JSONB NOT NULL DEFAULT '[]';
