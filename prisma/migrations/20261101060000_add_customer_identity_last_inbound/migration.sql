-- Track the last inbound WhatsApp message per contact. A message within 24h
-- opens Meta's customer-service window, allowing free-form text and avoiding
-- the per-user marketing-template delivery limit (131049).
ALTER TABLE "CustomerIdentity" ADD COLUMN "lastInboundAt" TIMESTAMP(3);
