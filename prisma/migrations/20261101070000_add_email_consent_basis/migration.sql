-- Distinguish an explicit email opt-in from a transactional cart/checkout
-- address. The latter may receive recovery mail because the shopper supplied
-- it to complete an order; WhatsApp still requires explicit consent.
ALTER TABLE "CustomerIdentity"
  ADD COLUMN "emailConsentBasis" TEXT NOT NULL DEFAULT 'none';

UPDATE "CustomerIdentity"
SET "emailConsentBasis" = 'explicit'
WHERE "consentEmail" = true;

UPDATE "CustomerIdentity"
SET "emailConsentBasis" = 'transactional'
WHERE "consentEmail" = false
  AND "email" IS NOT NULL
  AND "suppressed" = false
  AND "optedOutAt" IS NULL
  AND "consentSource" LIKE 'shopify_%';
