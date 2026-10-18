-- WhatsApp Cloud API business number id (Meta "phone_number_id") per store.
-- Lets the inbound WhatsApp webhook map a customer reply (STOP/opt-out) back to
-- the store that owns the number, so the opt-out is persisted instead of only
-- logged. Nullable: stores that have not registered a number stay unset, and the
-- webhook falls back to the sole active store when only one exists.
ALTER TABLE "Store" ADD COLUMN "whatsappPhoneNumberId" TEXT;
CREATE UNIQUE INDEX "Store_whatsappPhoneNumberId_key" ON "Store"("whatsappPhoneNumberId");
