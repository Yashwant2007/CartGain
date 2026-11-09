-- Compact tracked links for WhatsApp template buttons and message CTAs.
CREATE TABLE "RecoveryShortLink" (
    "code" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "discountCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryShortLink_pkey" PRIMARY KEY ("code")
);

CREATE UNIQUE INDEX "RecoveryShortLink_cartId_channel_kind_discountCode_key"
    ON "RecoveryShortLink"("cartId", "channel", "kind", "discountCode");

CREATE INDEX "RecoveryShortLink_cartId_idx" ON "RecoveryShortLink"("cartId");

ALTER TABLE "RecoveryShortLink"
    ADD CONSTRAINT "RecoveryShortLink_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
