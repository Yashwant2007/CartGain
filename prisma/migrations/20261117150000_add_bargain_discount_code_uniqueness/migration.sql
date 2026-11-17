-- Prevent duplicate issued discount codes per store. Postgres treats NULLs as
-- distinct, so pending/unissued sessions and quotes remain unaffected.
CREATE UNIQUE INDEX "BargainSession_storeId_discountCode_key"
  ON "BargainSession"("storeId", "discountCode");

CREATE UNIQUE INDEX "BargainQuote_storeId_discountCode_key"
  ON "BargainQuote"("storeId", "discountCode");
