-- Per-channel consent provenance for the recipient registry. Existing rows keep
-- their boolean flags; consent stays false unless a source explicitly granted it.
ALTER TABLE "CustomerIdentity"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "emailConsentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailConsentSource" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappConsentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "whatsappConsentSource" TEXT,
  ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastChannel" TEXT;

CREATE INDEX IF NOT EXISTS "CustomerIdentity_storeId_consentWhatsApp_suppressed_idx"
  ON "CustomerIdentity"("storeId", "consentWhatsApp", "suppressed");

-- Delivery bookkeeping on Message: attempts/backoff and an explainable skip reason.
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reasonCode" TEXT;

CREATE INDEX IF NOT EXISTS "Message_status_lastAttemptAt_idx"
  ON "Message"("status", "lastAttemptAt");
